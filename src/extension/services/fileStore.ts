import * as vscode from 'vscode';
import { applyChanges } from '../../core/edit/applyChanges';
import type { EditProblem } from '../../core/edit/editMessages';
import type { PlanResult } from '../../core/edit/planEdit';
import { ADAPTERS } from '../../core/formats/registry';
import type { AreaId } from '../../core/model/types';
import type { RootAnalysis } from '../../core/pipeline/analyze';
import { revisionOf } from '../../core/util/hash';
import { messageOf } from './errors';
import { holds, isDirty, put, readIfExists, relative, sameBytes, type Put } from './files';
import { insideRoot } from './uriPaths';
import type { IndexedRoot, IndexSnapshot, WorkspaceIndex } from './workspaceIndex';

/** One area root of a workspace folder: where an edit is planned and written. */
export interface RootRef {
  folder: vscode.Uri;
  areaId: AreaId;
  root: string;
}

/** Plans an edit on the current state of a root. The store plans again when files changed on disk (B5). */
export type Planner = (analysis: RootAnalysis) => PlanResult;

/** Runs right before files are written, e.g. to back them up; `files` is the number about to change. */
export type BeforeWrite = (kind: 'write' | 'restore', files: number) => Promise<void>;

/** A file and the bytes it gets back, e.g. from a backup. */
export interface RestoredFile {
  uri: vscode.Uri;
  bytes: Uint8Array;
}

export type WriteResult =
  | { ok: true }
  /** The edit does not fit the files (any more), e.g. the text changed in the meantime. */
  | { ok: false; reason: 'problem'; problem: EditProblem }
  /** Unsaved changes in an editor, or changed on disk since: nothing was written. */
  | { ok: false; reason: 'dirty' | 'changed'; files: vscode.Uri[] }
  /** Restricted mode: the extension only checks. */
  | { ok: false; reason: 'untrusted' }
  /** Reading or writing failed; files written before the failure got their old bytes back. */
  | { ok: false; reason: 'error'; message: string };

/** Writes that can be undone in a session; each keeps the previous bytes of its files. */
const UNDO_LIMIT = 100;
/** Plans per write: when files change on disk between planning and writing, the edit is planned again. */
const PLAN_ATTEMPTS = 3;

interface UndoEntry {
  files: { uri: vscode.Uri; before: Uint8Array | undefined; afterRevision: string }[];
}

export function rootRef(indexed: IndexedRoot): RootRef {
  return { folder: indexed.folder.uri, areaId: indexed.analysis.area.id, root: indexed.analysis.root };
}

/**
 * Writes translation files, one change at a time: plans on the indexed texts, checks that the files on disk
 * still have them, and writes every file of a change or none. Keeps an undo for the session.
 */
export class FileStore {
  // simplify: one queue for all files instead of one per file; writes are rare and quick, and a change over
  // several files then needs no lock ordering.
  private queue: Promise<unknown> = Promise.resolve();
  private readonly undoStack: UndoEntry[] = [];

  constructor(
    private readonly index: WorkspaceIndex,
    private readonly log: vscode.LogOutputChannel,
    private readonly beforeWrite: BeforeWrite = async () => undefined,
  ) {}

  /** Plans the edit on the current files and writes the result. Never throws; failures are results. */
  write(ref: RootRef, plan: Planner): Promise<WriteResult> {
    return this.enqueue(() => this.writeNow(ref, plan));
  }

  /** Gives files their bytes back, as one write that can be undone; files that already have them stay. */
  restore(files: readonly RestoredFile[]): Promise<WriteResult> {
    return this.enqueue(() => this.restoreNow(files));
  }

  /** Restores the files of the last write, if they still have the bytes it wrote. Undefined: nothing to undo. */
  undo(): Promise<WriteResult | undefined> {
    return this.enqueue(() => this.undoNow());
  }

  /** One write or undo at a time, in call order; unexpected errors become results. */
  private enqueue<T>(task: () => Promise<T>): Promise<T | WriteResult> {
    const guarded = async (): Promise<T | WriteResult> => {
      try {
        return await task();
      } catch (error) {
        this.log.error('Writing translation files failed.', error);
        return { ok: false, reason: 'error', message: messageOf(error) };
      }
    };
    const run = this.queue.then(guarded);
    this.queue = run;
    return run;
  }

  private async writeNow(ref: RootRef, plan: Planner): Promise<WriteResult> {
    if (!vscode.workspace.isTrusted) {
      return { ok: false, reason: 'untrusted' };
    }
    for (let attempt = 1; ; attempt++) {
      const indexed = await this.find(ref);
      if (!indexed) {
        const message = vscode.l10n.t('The translation folder {root} is no longer indexed.', {
          root: ref.root,
        });
        return { ok: false, reason: 'error', message };
      }
      const { analysis } = indexed;
      const adapter = ADAPTERS[analysis.area.format];
      const planned = plan(analysis);
      if (!planned.ok) {
        return { ok: false, reason: 'problem', problem: planned.problem };
      }
      const applied = applyChanges(planned.changes, analysis.bundles, adapter);
      if (!applied.ok) {
        return { ok: false, reason: 'problem', problem: applied.problem };
      }
      if (applied.writes.length === 0) {
        return { ok: true };
      }
      const outside = applied.writes.find((write) => !insideRoot(write.relPath, analysis.root));
      if (outside) {
        const message = vscode.l10n.t('{file} lies outside the translation folder {root}.', {
          file: outside.relPath,
          root: analysis.root,
        });
        return { ok: false, reason: 'error', message };
      }
      const targets = applied.writes.map((write) => ({
        uri: vscode.Uri.joinPath(indexed.folder.uri, ...write.relPath.split('/')),
        write,
        bytes: adapter.encode(write.after),
      }));
      const dirty = targets.filter((target) => isDirty(target.uri)).map((target) => target.uri);
      if (dirty.length > 0) {
        return { ok: false, reason: 'dirty', files: dirty };
      }
      const onDisk = await Promise.all(targets.map((target) => readIfExists(target.uri)));
      const changed = targets.filter((target, i) => !holds(onDisk[i], target.write.before, adapter));
      if (changed.length === 0) {
        return this.commit(
          'write',
          targets.map((target, i) => ({ uri: target.uri, bytes: target.bytes, before: onDisk[i] })),
        );
      }
      const uris = changed.map((target) => target.uri);
      if (attempt === PLAN_ATTEMPTS) {
        return { ok: false, reason: 'changed', files: uris };
      }
      this.log.info(`Changed on disk since indexing, planning again: ${uris.map(relative).join(', ')}`);
      await this.index.refresh();
    }
  }

  private async undoNow(): Promise<WriteResult | undefined> {
    const entry = this.undoStack.pop();
    if (!entry) {
      return undefined;
    }
    const dirty = entry.files.filter((file) => isDirty(file.uri)).map((file) => file.uri);
    if (dirty.length > 0) {
      // Once the editor is saved or reverted, the undo can be tried again.
      this.undoStack.push(entry);
      return { ok: false, reason: 'dirty', files: dirty };
    }
    const onDisk = await Promise.all(entry.files.map((file) => readIfExists(file.uri)));
    const changed = entry.files.filter((file, i) => {
      const bytes = onDisk[i];
      return bytes === undefined || revisionOf(bytes) !== file.afterRevision;
    });
    if (changed.length > 0) {
      // The state the write left is gone, so this write cannot be undone any more.
      return { ok: false, reason: 'changed', files: changed.map((file) => file.uri) };
    }
    const failure = await this.putAll(
      entry.files.map((file) => ({ uri: file.uri, bytes: file.before })),
      entry.files.map((file, i) => ({ uri: file.uri, bytes: onDisk[i] })),
    );
    if (failure) {
      this.undoStack.push(entry);
      return failure;
    }
    this.log.info(`Undid the write of ${entry.files.map((file) => relative(file.uri)).join(', ')}`);
    await this.reindex();
    return { ok: true };
  }

  private async restoreNow(files: readonly RestoredFile[]): Promise<WriteResult> {
    if (!vscode.workspace.isTrusted) {
      return { ok: false, reason: 'untrusted' };
    }
    const dirty = files.filter((file) => isDirty(file.uri)).map((file) => file.uri);
    if (dirty.length > 0) {
      return { ok: false, reason: 'dirty', files: dirty };
    }
    const onDisk = await Promise.all(files.map((file) => readIfExists(file.uri)));
    const differing = files
      .map((file, i) => ({ ...file, before: onDisk[i] }))
      .filter((file) => file.before === undefined || !sameBytes(file.before, file.bytes));
    return differing.length === 0 ? { ok: true } : this.commit('restore', differing);
  }

  /** Lets `beforeWrite` run (backups), writes all files or none, and keeps the write for undo. */
  private async commit(
    kind: 'write' | 'restore',
    files: { uri: vscode.Uri; bytes: Uint8Array; before: Uint8Array | undefined }[],
  ): Promise<WriteResult> {
    await this.beforeWrite(kind, files.length);
    const failure = await this.putAll(
      files,
      files.map((file) => ({ uri: file.uri, bytes: file.before })),
    );
    if (failure) {
      return failure;
    }
    this.undoStack.push({
      files: files.map((file) => ({
        uri: file.uri,
        before: file.before,
        afterRevision: revisionOf(file.bytes),
      })),
    });
    if (this.undoStack.length > UNDO_LIMIT) {
      this.undoStack.shift();
    }
    this.log.info(
      `${kind === 'write' ? 'Wrote' : 'Restored'} ${files.map((file) => relative(file.uri)).join(', ')}`,
    );
    await this.reindex();
    return { ok: true };
  }

  /**
   * Writes the files in order. If one fails, those written before it get their `restore` bytes back, so that
   * all or none are written. Returns the failure, or undefined when every file was written.
   */
  private async putAll(files: Put[], restore: Put[]): Promise<WriteResult | undefined> {
    for (const [position, file] of files.entries()) {
      try {
        await put(file);
      } catch (error) {
        this.log.error(`Could not write ${relative(file.uri)}; restoring the files written before.`, error);
        for (const done of restore.slice(0, position).reverse()) {
          await put(done).catch((restoreError: unknown) =>
            this.log.error(`Could not restore ${relative(done.uri)}.`, restoreError),
          );
        }
        return { ok: false, reason: 'error', message: messageOf(error) };
      }
    }
    return undefined;
  }

  /** The indexed root, after a new run if the last one does not have it (e.g. before the first run ended). */
  private async find(ref: RootRef): Promise<IndexedRoot | undefined> {
    const lookup = (snapshot: IndexSnapshot | undefined) =>
      snapshot?.roots.find(
        (indexed) =>
          indexed.folder.uri.toString() === ref.folder.toString() &&
          indexed.analysis.area.id === ref.areaId &&
          indexed.analysis.root === ref.root,
      );
    return lookup(this.index.current()) ?? lookup(await this.index.refresh());
  }

  /** The written files are indexed right away instead of after the watcher's delay. */
  private async reindex(): Promise<void> {
    try {
      await this.index.refresh();
    } catch (error) {
      this.log.error('Indexing after writing failed.', error);
    }
  }
}
