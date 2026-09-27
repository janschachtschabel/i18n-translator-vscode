import * as vscode from 'vscode';
import { analysisOptions, BACKUP_SETTING_KEYS, SETTING_KEYS } from '../../core/config/settings';
import { analyzeRoot, type RootAnalysis } from '../../core/pipeline/analyze';
import { revisionOf } from '../../core/util/hash';
import { excludeGlob } from '../config';
import {
  keyOf,
  logRun,
  notIndexed,
  readRoot,
  rootRef,
  runFull,
  type IndexedRoot,
  type IndexSnapshot,
  type RootRef,
  type RunContext,
} from './indexRun';
import { IndexWatchers } from './indexWatchers';
import { readFiles, revisionsOf, ROOT_LIMITS, sameRevisions, type RootLimits } from './rootFiles';
import { SerialRunner } from './serialRunner';
import { relativeUriPath } from './uriPaths';

// The types of what the index publishes come from its runs; the modules of the extension take them from here.
export { rootRef, type IndexedRoot, type IndexSnapshot, type RootRef } from './indexRun';

/** The settings a run reads: a change of one of them starts a run. */
const INDEXED_SETTING_KEYS = [...SETTING_KEYS, ...BACKUP_SETTING_KEYS];

/** Saving several files in a row, or a branch switch, should cause one run. */
const DEBOUNCE_MS = 300;

/**
 * Finds, reads and checks the translation files of every workspace folder and keeps the result current. A full
 * run looks for the roots of each area, which searches the whole workspace; it follows settings, folders, trust
 * and marker files. A change inside a root (saved, written, created, deleted) indexes only that root again.
 */
export class WorkspaceIndex implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<IndexSnapshot>();
  /** Fires after every full run, and after a run of a root whose files changed. */
  readonly onDidChange = this.changed.event;

  /** Calls during a full run share one run that starts after it. */
  private readonly runner = new SerialRunner(() => this.exclusive(() => this.index()));
  /** The same per root, by {@link keyOf}. */
  private readonly rootRunners = new Map<string, SerialRunner<IndexSnapshot>>();
  /** Runs one at a time, full or of a root: each builds on the snapshot of the one before. */
  private chain: Promise<unknown> = Promise.resolve();
  /** The files of each root as last indexed, so that a run on unchanged files does nothing. */
  private readonly revisions = new Map<string, ReadonlyMap<string, string>>();
  /** What the last full run could not use (settings, detection); the unreadable files are per root. */
  private generalErrors: string[] = [];
  private readonly rootErrors = new Map<string, string[]>();
  private readonly watchers = new IndexWatchers();
  private readonly subscriptions: vscode.Disposable[] = [this.changed, this.watchers];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * The files the watcher of a root reported while its run waited, by {@link keyOf}, each once: a tool that writes a
   * file more often than the delay would otherwise grow the list until it pauses.
   */
  private readonly reported = new Map<string, Map<string, vscode.Uri>>();
  private snapshot: IndexSnapshot | undefined;
  private disposed = false;
  /** What a run needs from the index. */
  private readonly context: RunContext;

  /** `limits`: what a repository may hold (rootFiles.ts); the tests give smaller ones. */
  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly limits: RootLimits = ROOT_LIMITS,
  ) {
    this.context = {
      log,
      limits,
      onMarker: () => this.schedule(),
      onRootFile: (ref, uri) => this.schedule(ref, uri),
    };
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        // Not the AI settings, which no run reads: a change of the model would read the workspace anew. The backup
        // settings are read for their errors, which a run shows with the others; they rarely change.
        if (INDEXED_SETTING_KEYS.some((key) => event.affectsConfiguration(`eduI18n.${key}`))) {
          this.schedule();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedule()),
      // Restricted settings (areas, roots, variants) take their workspace values once the workspace is trusted.
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.schedule()),
    );
  }

  /** The result of the last completed run. */
  current(): IndexSnapshot | undefined {
    return this.snapshot;
  }

  /** Indexes the whole workspace, looking for roots anew. */
  refresh(): Promise<IndexSnapshot> {
    return this.runner.run();
  }

  /**
   * The result of the last run, or of a first one if none has ended yet (e.g. right after activation): the run in
   * progress, if there is one, rather than another run after it.
   */
  latest(): Promise<IndexSnapshot> {
    return this.snapshot ? Promise.resolve(this.snapshot) : (this.runner.active() ?? this.refresh());
  }

  /**
   * Runs `task` (the file store writing files) while no run of the index reads files: a run that read a file
   * while it is written would see it empty or half written, and publish that as the model.
   */
  whileWriting<T>(task: () => Promise<T>): Promise<T> {
    return this.exclusive(task);
  }

  /**
   * Indexes one root again, e.g. after its files were written: without the search for roots, and without a new
   * analysis if its files are as they were. Before the first run it makes a full one; a root the last run did not
   * have is left as it is (e.g. the watcher of a root that a branch switch took away).
   */
  refreshRoot(ref: RootRef): Promise<IndexSnapshot> {
    const key = keyOf(ref);
    let runner = this.rootRunners.get(key);
    if (!runner) {
      runner = new SerialRunner(() => this.exclusive(() => this.indexRoot(ref)));
      this.rootRunners.set(key, runner);
    }
    return runner.run();
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.reported.clear();
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  /**
   * A full run, or one of a root, after `DEBOUNCE_MS` without further calls for it. A root's run gets the files the
   * watcher reported meanwhile.
   */
  private schedule(ref?: RootRef, uri?: vscode.Uri): void {
    const key = ref ? keyOf(ref) : '';
    if (uri) {
      const reported = this.reported.get(key) ?? new Map<string, vscode.Uri>();
      reported.set(uri.toString(), uri);
      this.reported.set(key, reported);
    }
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        const reported = [...(this.reported.get(key)?.values() ?? [])];
        this.reported.delete(key);
        const run = ref ? this.refreshReported(ref, reported) : this.refresh();
        run.catch((error: unknown) => this.log.error('Indexing failed.', error));
      }, DEBOUNCE_MS),
    );
  }

  /**
   * Indexes the root again, unless the files the watcher reported hold what the last run read: e.g. those a write
   * indexed right away, whose watcher's run listed and read the whole root only to find that, while a save waited
   * for it (audit P-06).
   */
  private async refreshReported(ref: RootRef, reported: readonly vscode.Uri[]): Promise<IndexSnapshot> {
    return (await this.exclusive(() => this.asIndexed(ref, reported))) ?? this.refreshRoot(ref);
  }

  /**
   * The last snapshot, if the root was indexed without errors and each file holds what it read then; undefined if a
   * file differs, is new, has gone, cannot be read or would not be (a link, too large).
   */
  private async asIndexed(ref: RootRef, uris: readonly vscode.Uri[]): Promise<IndexSnapshot | undefined> {
    const key = keyOf(ref);
    const revisions = this.revisions.get(key);
    const indexed = this.snapshot?.roots.find((candidate) => keyOf(rootRef(candidate)) === key);
    if (!indexed || !revisions || uris.length === 0 || (this.rootErrors.get(key)?.length ?? 0) > 0) {
      return undefined;
    }
    const paths = [...new Set(uris.map((uri) => relativeUriPath(ref.folder.path, uri.path)))];
    if (!paths.every((path): path is string => path !== undefined && revisions.has(path))) {
      return undefined;
    }
    let unreadable = false;
    const files = await readFiles(indexed.folder, paths, () => (unreadable = true), this.limits);
    const same =
      !unreadable &&
      files.length === paths.length &&
      files.every((file) => revisions.get(file.relPath) === revisionOf(file.bytes));
    return same ? this.snapshot : undefined;
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async index(): Promise<IndexSnapshot> {
    const started = Date.now();
    const run = await runFull(this.context);
    if (this.disposed) {
      return { roots: run.roots, errors: [], durationMs: Date.now() - started };
    }
    this.generalErrors = run.generalErrors;
    this.replace(this.rootErrors, run.rootErrors);
    this.replace(this.revisions, run.revisions);
    this.watchers.update(run.watched);
    const snapshot = this.publish(run.roots, started);
    logRun(this.log, snapshot, run.timings);
    return snapshot;
  }

  private async indexRoot(ref: RootRef): Promise<IndexSnapshot> {
    const key = keyOf(ref);
    if (!this.snapshot) {
      return this.index();
    }
    const position = this.snapshot.roots.findIndex((indexed) => keyOf(rootRef(indexed)) === key);
    if (position === -1) {
      return this.snapshot;
    }
    const started = Date.now();
    const { folder, settings, analysis: before } = this.snapshot.roots[position]!;
    const errors: string[] = [];
    let revisions: ReadonlyMap<string, string>;
    let analysis: RootAnalysis;
    try {
      const files = await readRoot(
        this.context,
        folder,
        before.area,
        before.root,
        excludeGlob(settings.exclude),
        errors,
      );
      revisions = revisionsOf(files);
      const unchanged =
        errors.length === 0 &&
        (this.rootErrors.get(key)?.length ?? 0) === 0 &&
        sameRevisions(this.revisions.get(key), revisions);
      if (unchanged || this.disposed) {
        return this.snapshot;
      }
      analysis = analyzeRoot(before.area, before.root, files, analysisOptions(settings).options);
    } catch (error) {
      // As a full run does, the root is named as not checked; its last analysis stays, so that its editors keep their
      // model until a run succeeds (audit L-22).
      this.rootErrors.set(key, [notIndexed(this.context, folder, before.area, before.root, error)]);
      return this.publish(this.snapshot.roots, started);
    }
    this.rootErrors.set(key, errors);
    this.revisions.set(key, revisions);
    const roots = this.snapshot.roots.map((indexed, index) =>
      index === position ? { folder, settings, analysis } : indexed,
    );
    const snapshot = this.publish(roots, started);
    this.log.info(`Indexed ${before.area.id} in ${before.root || '.'} in ${snapshot.durationMs} ms.`);
    for (const error of errors) {
      this.log.warn(error);
    }
    return snapshot;
  }

  private publish(roots: IndexedRoot[], started: number): IndexSnapshot {
    const errors = [...this.generalErrors, ...[...this.rootErrors.values()].flat()];
    const snapshot: IndexSnapshot = { roots, errors, durationMs: Date.now() - started };
    this.snapshot = snapshot;
    this.changed.fire(snapshot);
    return snapshot;
  }

  private replace<T>(target: Map<string, T>, source: ReadonlyMap<string, T>): void {
    target.clear();
    source.forEach((value, key) => target.set(key, value));
  }
}
