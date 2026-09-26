import * as vscode from 'vscode';
import { compileFilePattern } from '../../core/area/filePattern';
import { applyChanges } from '../../core/edit/applyChanges';
import type { EditProblem } from '../../core/edit/editMessages';
import type { PlanResult } from '../../core/edit/planEdit';
import { ADAPTERS } from '../../core/formats/registry';
import type { LoadedFile } from '../../core/model/bundle';
import type { RootAnalysis } from '../../core/pipeline/analyze';
import { revisionOf } from '../../core/util/hash';
import { messageOf } from './errors';
import { firstLinked } from './links';
import {
  holds,
  isDirty,
  putAllOrNone,
  readIfExists,
  relative,
  sameBytes,
  type FileAccess,
  type Put,
} from './files';
import { UndoHistory, type UndoEntry, type UndoLimits } from './undoHistory';
import { insideRoot, relativeUriPath } from './uriPaths';
import {
  rootRef,
  type IndexedRoot,
  type IndexSnapshot,
  type RootRef,
  type WorkspaceIndex,
} from './workspaceIndex';

/** Plans an edit on the current state of a root. The store plans again when files changed on disk (B5). */
export type Planner = (analysis: RootAnalysis) => PlanResult;

/**
 * Runs before the files are checked and written, e.g. to back them up; `bundles` is how many bundles the write
 * changes (for a restore, how many files it may change). It runs inside the store's queue, so it must not call
 * write, restore, undo or exclusive.
 */
export type BeforeWrite = (kind: 'write' | 'restore', bundles: number) => Promise<void>;

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
  /** Reading or writing failed. The files got their old bytes back, except `notRestored` (may be damaged). */
  | { ok: false; reason: 'error'; message: string; notRestored?: vscode.Uri[] };

/** A failure to read or write, the only result a step can end with before it has a result of its own. */
type WriteError = Extract<WriteResult, { reason: 'error' }>;

/** What an undo did: which files got their bytes back, or why none did. */
export type UndoResult =
  { ok: true; files: vscode.Uri[] } | { ok: false; reason: 'declined' } | Exclude<WriteResult, { ok: true }>;

/** Plans per write: when files change on disk between planning and writing, the edit is planned again. */
const PLAN_ATTEMPTS = 3;

/**
 * Writes translation files, one change at a time: plans on the indexed texts, checks that the files on disk
 * still have them, and writes every file of a change or none. Keeps an undo for the session.
 */
export class FileStore {
  // simplify: one queue for all files instead of one per file; writes are rare and quick, and a change over
  // several files then needs no lock ordering.
  private queue: Promise<unknown> = Promise.resolve();
  /**
   * The index run after the last change. A write answers without waiting for it (the files are written, only
   * their findings follow); the next task waits for it instead.
   */
  private indexing: Promise<void> = Promise.resolve();
  private readonly history: UndoHistory;
  private readonly beforeWrite: BeforeWrite;
  private readonly files: FileAccess;
  private readonly trusted: () => boolean;

  constructor(
    private readonly index: WorkspaceIndex,
    private readonly log: vscode.LogOutputChannel,
    options: {
      beforeWrite?: BeforeWrite;
      files?: FileAccess;
      limits?: UndoLimits;
      trusted?: () => boolean;
    } = {},
  ) {
    this.history = new UndoHistory(options.limits);
    this.beforeWrite = options.beforeWrite ?? (async () => undefined);
    this.files = options.files ?? vscode.workspace.fs;
    this.trusted = options.trusted ?? (() => vscode.workspace.isTrusted);
  }

  /**
   * Whether files may be written: not in Restricted Mode (an untrusted workspace). Commands ask before their first
   * question, so that nobody answers questions for a change that cannot happen.
   */
  canWrite(): boolean {
    return this.trusted();
  }

  /** Plans the edit on the current files and writes the result. Never throws; failures are results. */
  write(ref: RootRef, plan: Planner): Promise<WriteResult> {
    return this.enqueue(() => this.writeNow(ref, plan));
  }

  /** Gives files their bytes back, as one write that can be undone; files that already have them stay. */
  restore(files: readonly RestoredFile[]): Promise<WriteResult> {
    return this.enqueue(() => this.restoreNow(files));
  }

  /**
   * Restores the files of the last write, if they still have the bytes it wrote. `accept` is asked first, with
   * the files the undo would restore; if it declines, the undo stays. Undefined: nothing to undo.
   */
  undo(accept?: (files: readonly vscode.Uri[]) => Promise<boolean>): Promise<UndoResult | undefined> {
    return this.enqueue(() => this.undoNow(accept));
  }

  /**
   * Runs a task between writes, in call order, e.g. a backup that must not see a change half-written. The
   * task must not call write, restore, undo or exclusive: they would wait for it forever.
   */
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    // After the index run of the last change: each task plans on the files as written.
    const run = this.queue.then(() => this.indexing).then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Resolves once the changes so far are indexed: their findings are known, and open editors have them. */
  indexed(): Promise<void> {
    return this.queue.then(() => this.indexing);
  }

  /** One write or undo at a time, in call order; unexpected errors become results. */
  private enqueue<T>(task: () => Promise<T>): Promise<T | WriteError> {
    return this.exclusive(async (): Promise<T | WriteError> => {
      try {
        return await task();
      } catch (error) {
        this.log.error('Writing translation files failed.', error);
        return { ok: false, reason: 'error', message: messageOf(error) };
      }
    });
  }

  private async writeNow(ref: RootRef, plan: Planner): Promise<WriteResult> {
    if (!this.canWrite()) {
      return { ok: false, reason: 'untrusted' };
    }
    const started = Date.now();
    let backedUp = false;
    for (let attempt = 1; ; attempt++) {
      const indexed = await this.find(ref);
      if (!indexed) {
        const message = vscode.l10n.t('The translation folder {root} is no longer indexed.', {
          root: ref.root || '.',
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
      if (!backedUp) {
        // Before the checks of editors and disk: between checking the files and writing them, nothing slow may
        // happen, and a backup can take a few hundred milliseconds.
        await this.beforeWrite(
          'write',
          bundlesOf(
            analysis,
            targets.map((target) => target.write.relPath),
          ),
        );
        backedUp = true;
      }
      const dirty = targets.filter((target) => isDirty(target.uri)).map((target) => target.uri);
      if (dirty.length > 0) {
        return { ok: false, reason: 'dirty', files: dirty };
      }
      // The plan rests on every file of the bundles it changes (B5), not only on those it writes: e.g. a key that a
      // git pull deleted from the others must not come back in the file that is written.
      const written = new Set(targets.map((target) => target.write.relPath));
      const inputs = bundleFiles(analysis, [...written])
        .filter((file) => !written.has(file.relPath))
        .map((file) => ({ uri: vscode.Uri.joinPath(indexed.folder.uri, ...file.relPath.split('/')), file }));
      const [onDisk, inputsOnDisk] = await Promise.all([
        Promise.all(targets.map((target) => readIfExists(target.uri, this.files))),
        Promise.all(inputs.map((input) => readIfExists(input.uri, this.files))),
      ]);
      const uris = [
        ...targets.filter((target, i) => !holds(onDisk[i], target.write.before, adapter)),
        ...inputs.filter((input, i) => !holds(inputsOnDisk[i], input.file.doc, adapter)),
      ].map((changed) => changed.uri);
      if (uris.length === 0) {
        return this.commit(
          'write',
          targets.map((target, i) => ({ uri: target.uri, bytes: target.bytes, before: onDisk[i] })),
          started,
        );
      }
      if (attempt === PLAN_ATTEMPTS) {
        return { ok: false, reason: 'changed', files: uris };
      }
      this.log.info(`Changed on disk since indexing, planning again: ${uris.map(relative).join(', ')}`);
      await this.index.refreshRoot(ref);
    }
  }

  private async undoNow(
    accept: ((files: readonly vscode.Uri[]) => Promise<boolean>) | undefined,
  ): Promise<UndoResult | undefined> {
    const entry = this.history.pop();
    if (!entry) {
      return undefined;
    }
    if (!this.canWrite()) {
      // The undo stays for when the workspace is trusted.
      this.history.push(entry);
      return { ok: false, reason: 'untrusted' };
    }
    let result: UndoResult;
    try {
      // Asked in the queue: no write comes between the question and the undo of the files it names.
      result =
        accept && !(await accept(entry.files.map((file) => file.uri)))
          ? { ok: false, reason: 'declined' }
          : await this.undoEntry(entry);
    } catch (error) {
      // A read or write error says nothing about the state the write left: the undo stays for another try.
      this.history.push(entry);
      throw error;
    }
    // Only a changed file ends an undo for good: the state the write left is gone. A declined undo, unsaved
    // editors and failed writes leave it for another try.
    if (!result.ok && result.reason !== 'changed') {
      this.history.push(entry);
    }
    return result;
  }

  private async undoEntry(entry: UndoEntry): Promise<UndoResult> {
    const dirty = entry.files.filter((file) => isDirty(file.uri)).map((file) => file.uri);
    if (dirty.length > 0) {
      return { ok: false, reason: 'dirty', files: dirty };
    }
    const onDisk = await Promise.all(entry.files.map((file) => readIfExists(file.uri, this.files)));
    const changed = entry.files.filter((file, i) => {
      const bytes = onDisk[i];
      return bytes === undefined || revisionOf(bytes) !== file.afterRevision;
    });
    if (changed.length > 0) {
      return { ok: false, reason: 'changed', files: changed.map((file) => file.uri) };
    }
    const failure = await this.putAll(
      entry.files.map((file) => ({ uri: file.uri, bytes: file.before })),
      entry.files.map((file, i) => ({ uri: file.uri, bytes: onDisk[i] })),
    );
    if (failure) {
      return failure;
    }
    this.log.info(`Undid the write of ${entry.files.map((file) => relative(file.uri)).join(', ')}`);
    this.indexing = this.reindex(entry.files.map((file) => file.uri));
    return { ok: true, files: entry.files.map((file) => file.uri) };
  }

  private async restoreNow(files: readonly RestoredFile[]): Promise<WriteResult> {
    if (!this.canWrite()) {
      return { ok: false, reason: 'untrusted' };
    }
    const started = Date.now();
    // Like a write, a restore stays in the translation folders, whatever the backup it came from says.
    const snapshot = await this.index.latest();
    const outside = files.find((file) => !snapshot.roots.some((indexed) => inRoot(file.uri, indexed)));
    if (outside) {
      const message = vscode.l10n.t('{file} lies outside the translation folders.', {
        file: relative(outside.uri),
      });
      return { ok: false, reason: 'error', message };
    }
    try {
      await this.beforeWrite('restore', files.length);
    } catch (error) {
      // A restore replaces files wholesale; without a backup of the current state it must not happen.
      this.log.error('Backing up before the restore failed; nothing was restored.', error);
      const message = vscode.l10n.t(
        'The current state could not be backed up, so nothing was restored: {error}',
        {
          error: messageOf(error),
        },
      );
      return { ok: false, reason: 'error', message };
    }
    // After the backup, which takes a moment: a file may have got unsaved changes meanwhile.
    const dirty = files.filter((file) => isDirty(file.uri)).map((file) => file.uri);
    if (dirty.length > 0) {
      return { ok: false, reason: 'dirty', files: dirty };
    }
    const onDisk = await Promise.all(files.map((file) => readIfExists(file.uri, this.files)));
    const differing = files
      .map((file, i) => ({ ...file, before: onDisk[i] }))
      .filter((file) => file.before === undefined || !sameBytes(file.before, file.bytes));
    return differing.length === 0 ? { ok: true } : this.commit('restore', differing, started);
  }

  /** Writes all files or none and keeps the write for undo; `started`: when the task began, for the log. */
  private async commit(
    kind: 'write' | 'restore',
    files: { uri: vscode.Uri; bytes: Uint8Array; before: Uint8Array | undefined }[],
    started: number,
  ): Promise<WriteResult> {
    const failure = await this.putAll(
      files,
      files.map((file) => ({ uri: file.uri, bytes: file.before })),
    );
    if (failure) {
      return failure;
    }
    this.history.push({
      files: files.map((file) => ({
        uri: file.uri,
        before: file.before,
        afterRevision: revisionOf(file.bytes),
      })),
    });
    this.log.info(
      `${kind === 'write' ? 'Wrote' : 'Restored'} ${files.map((file) => relative(file.uri)).join(', ')} in ${Date.now() - started} ms.`,
    );
    this.indexing = this.reindex(files.map((file) => file.uri));
    return { ok: true };
  }

  /** Writes all files or none, and none through a symbolic link; the failure, if any, as a result. */
  private async putAll(files: Put[], restore: Put[]): Promise<WriteError | undefined> {
    const linked = await firstLinked(files.map((file) => file.uri));
    if (linked) {
      const message = vscode.l10n.t(
        '{file} is reached through the symbolic link {link}; nothing was written.',
        {
          file: relative(linked.uri),
          link: linked.link,
        },
      );
      return { ok: false, reason: 'error', message };
    }
    const failure = await this.index.whileWriting(() => putAllOrNone(this.files, files, restore, this.log));
    if (!failure) {
      return undefined;
    }
    const result = { ok: false, reason: 'error', message: messageOf(failure.error) } as const;
    return failure.notRestored.length > 0 ? { ...result, notRestored: failure.notRestored } : result;
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

  /**
   * The roots of the written files are indexed right away instead of after the watcher's delay; the watcher's
   * run then finds them as indexed and does nothing.
   */
  private async reindex(uris: readonly vscode.Uri[]): Promise<void> {
    try {
      const roots = this.index.current()?.roots.filter((indexed) => uris.some((uri) => inRoot(uri, indexed)));
      if (!roots?.length) {
        await this.index.refresh();
      }
      for (const indexed of roots ?? []) {
        await this.index.refreshRoot(rootRef(indexed));
      }
    } catch (error) {
      this.log.error('Indexing after writing failed.', error);
    }
  }
}

/** Whether a file lies inside the area root of an indexed workspace folder. */
function inRoot(uri: vscode.Uri, indexed: IndexedRoot): boolean {
  const folder = indexed.folder.uri;
  const relPath = relativeUriPath(folder.path, uri.path);
  return (
    uri.scheme === folder.scheme &&
    uri.authority === folder.authority &&
    relPath !== undefined &&
    insideRoot(relPath, indexed.analysis.root)
  );
}

/** How many bundles a write changes. */
function bundlesOf(analysis: RootAnalysis, relPaths: readonly string[]): number {
  return new Set(bundleNames(analysis, relPaths)).size;
}

/** The files of the bundles that `relPaths` belong to, as the analysis read them. */
function bundleFiles(analysis: RootAnalysis, relPaths: readonly string[]): LoadedFile[] {
  const names = new Set(bundleNames(analysis, relPaths));
  return analysis.bundles
    .filter((bundle) => names.has(bundle.name))
    .flatMap((bundle) => bundle.locales.map((locale) => bundle.file(locale)!));
}

/** The bundle of each path by the area's file pattern, which knows new files too; the path itself if none. */
function bundleNames(analysis: RootAnalysis, relPaths: readonly string[]): string[] {
  const match = compileFilePattern(analysis.area);
  const prefix = analysis.root === '' ? '' : `${analysis.root}/`;
  return relPaths.map((relPath) => match(relPath.slice(prefix.length))?.bundle ?? relPath);
}
