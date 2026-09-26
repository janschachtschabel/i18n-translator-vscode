import * as vscode from 'vscode';
import type { Settings } from '../../core/config/settings';
import type { AreaId } from '../../core/model/types';
import { analyzeRoot, type RootAnalysis } from '../../core/pipeline/analyze';
import { analysisOptions } from '../../core/config/settings';
import { excludeGlob, readBackupSettings, readSettings } from '../config';
import { messageOf } from './errors';
import { IndexWatchers, type WatchedPattern } from './indexWatchers';
import { detectRoots, fixedRoots, listRoot, readFiles, revisionsOf, sameRevisions } from './rootFiles';
import { SerialRunner } from './serialRunner';

export interface IndexedRoot {
  /** The workspace folder that the root and every path of the analysis are relative to. */
  folder: vscode.WorkspaceFolder;
  /** The validated settings of that folder, as used for the analysis. */
  settings: Settings;
  analysis: RootAnalysis;
}

export interface IndexSnapshot {
  /** One entry per area root; two roots are two independent installations. */
  roots: IndexedRoot[];
  /** Settings the index could not use and files it could not read; everything else was indexed. */
  errors: string[];
  durationMs: number;
}

/** One area root of a workspace folder: what the index reads again, and where an edit is planned and written. */
export interface RootRef {
  folder: vscode.Uri;
  areaId: AreaId;
  root: string;
}

export function rootRef(indexed: IndexedRoot): RootRef {
  return { folder: indexed.folder.uri, areaId: indexed.analysis.area.id, root: indexed.analysis.root };
}

/** Saving several files in a row, or a branch switch, should cause one run. */
const DEBOUNCE_MS = 300;

/** Milliseconds per phase of one run, summed over all roots; logged to find slow steps. */
interface Timings {
  detect: number;
  list: number;
  read: number;
  analyze: number;
}

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
  private snapshot: IndexSnapshot | undefined;
  private disposed = false;

  constructor(private readonly log: vscode.LogOutputChannel) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('eduI18n')) {
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
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  /** A full run, or one of a root, after `DEBOUNCE_MS` without further calls for it. */
  private schedule(ref?: RootRef): void {
    const key = ref ? keyOf(ref) : '';
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        const run = ref ? this.refreshRoot(ref) : this.refresh();
        run.catch((error: unknown) => this.log.error('Indexing failed.', error));
      }, DEBOUNCE_MS),
    );
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async index(): Promise<IndexSnapshot> {
    const started = Date.now();
    const timings: Timings = { detect: 0, list: 0, read: 0, analyze: 0 };
    const timed = async <T>(phase: keyof Timings, work: () => T | Promise<T>): Promise<T> => {
      const phaseStarted = Date.now();
      try {
        return await work();
      } finally {
        timings[phase] += Date.now() - phaseStarted;
      }
    };
    const roots: IndexedRoot[] = [];
    const generalErrors: string[] = [...readBackupSettings().errors];
    const rootErrors = new Map<string, string[]>();
    const revisions = new Map<string, ReadonlyMap<string, string>>();
    const watched = new Map<string, WatchedPattern>();

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const { settings, errors: settingErrors } = readSettings(folder.uri);
      const { options, errors: variantErrors } = analysisOptions(settings);
      generalErrors.push(...[...settingErrors, ...variantErrors].map((error) => inFolder(folder, error)));
      const exclude = excludeGlob(settings.exclude);

      for (const area of settings.areas) {
        const fixed = fixedRoots(area, settings);
        if (!fixed && area.detect) {
          // New roots appear with their marker file (e.g. a new checkout below the workspace folder).
          watched.set(`${folder.uri}|detect|${area.id}`, {
            pattern: new vscode.RelativePattern(folder, area.detect.glob),
            onChange: () => this.schedule(),
            contents: false,
          });
        }
        let areaRoots: readonly string[];
        try {
          areaRoots = fixed ?? (await timed('detect', () => detectRoots(folder, area, exclude)));
        } catch (error) {
          this.log.error(`Could not look for roots of ${area.id}.`, error);
          generalErrors.push(
            inFolder(
              folder,
              vscode.l10n.t('The roots of {area} could not be determined: {error}', {
                area: area.label,
                error: messageOf(error),
              }),
            ),
          );
          continue;
        }
        for (const root of areaRoots) {
          const base = vscode.Uri.joinPath(folder.uri, root);
          // In nested workspace folders, a root belongs to the innermost one; otherwise it would count twice.
          if (vscode.workspace.getWorkspaceFolder(base)?.uri.toString() !== folder.uri.toString()) {
            continue;
          }
          const ref: RootRef = { folder: folder.uri, areaId: area.id, root };
          const key = keyOf(ref);
          watched.set(`${key}|root`, {
            pattern: new vscode.RelativePattern(base, '**/*'),
            onChange: () => this.schedule(ref),
            contents: true,
          });
          const errors: string[] = [];
          rootErrors.set(key, errors);
          try {
            const paths = await timed('list', () => listRoot(folder, area, root, exclude));
            const files = await timed('read', () =>
              readFiles(folder, paths, (error) => errors.push(inFolder(folder, error))),
            );
            const analysis = await timed('analyze', () => analyzeRoot(area, root, files, options));
            roots.push({ folder, settings, analysis });
            revisions.set(key, revisionsOf(files));
          } catch (error) {
            this.log.error(`Could not index ${area.id} in ${root || '.'}.`, error);
            errors.push(
              inFolder(
                folder,
                vscode.l10n.t('{area} in {root} could not be checked: {error}', {
                  area: area.label,
                  root: root || '.',
                  error: messageOf(error),
                }),
              ),
            );
          }
        }
      }
    }

    if (this.disposed) {
      return { roots, errors: [], durationMs: Date.now() - started };
    }
    this.generalErrors = generalErrors;
    this.replace(this.rootErrors, rootErrors);
    this.replace(this.revisions, revisions);
    this.watchers.update(watched);
    const snapshot = this.publish(roots, started);
    const phases = Object.entries(timings)
      .map(([phase, ms]) => `${phase} ${ms} ms`)
      .join(', ');
    const bundles = roots.reduce((sum, root) => sum + root.analysis.bundles.length, 0);
    const issues = roots.reduce((sum, root) => sum + root.analysis.issues.length, 0);
    this.log.info(
      `Indexed ${roots.length} roots, ${bundles} bundles, ${issues} findings in ${snapshot.durationMs} ms (${phases}).`,
    );
    for (const warning of roots.flatMap((root) => root.analysis.warnings)) {
      this.log.warn(warning);
    }
    for (const error of snapshot.errors) {
      this.log.warn(error);
    }
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
    const paths = await listRoot(folder, before.area, before.root, excludeGlob(settings.exclude));
    const files = await readFiles(folder, paths, (error) => errors.push(inFolder(folder, error)));
    const revisions = revisionsOf(files);
    const unchanged =
      errors.length === 0 &&
      (this.rootErrors.get(key)?.length ?? 0) === 0 &&
      sameRevisions(this.revisions.get(key), revisions);
    if (unchanged || this.disposed) {
      return this.snapshot;
    }
    const analysis = analyzeRoot(before.area, before.root, files, analysisOptions(settings).options);
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

/** A message about a folder, named when the workspace has several. */
function inFolder(folder: vscode.WorkspaceFolder, message: string): string {
  return (vscode.workspace.workspaceFolders?.length ?? 0) > 1 ? `${folder.name}: ${message}` : message;
}

function keyOf(ref: RootRef): string {
  return JSON.stringify([ref.folder.toString(), ref.areaId, ref.root]);
}
