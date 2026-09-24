import * as vscode from 'vscode';
import type { AreaDefinition } from '../../core/area/areaDefinition';
import { compileVariants } from '../../core/checks/variants';
import type { Settings } from '../../core/config/settings';
import { rootsFromMarkers } from '../../core/discovery/discover';
import {
  analyzeRoot,
  filesToRead,
  type AnalysisOptions,
  type RootAnalysis,
  type SourceFile,
} from '../../core/pipeline/analyze';
import { excludeGlob, readSettings } from '../config';
import { SerialRunner } from './serialRunner';
import { relativeUriPath } from './uriPaths';

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

/** Saving several files in a row, or a branch switch, should cause one run. */
const DEBOUNCE_MS = 300;

/** Milliseconds per phase of one run, summed over all roots; logged to find slow steps. */
interface Timings {
  detect: number;
  list: number;
  read: number;
  analyze: number;
}

/** Finds, reads and checks the translation files of every workspace folder and keeps the result current. */
export class WorkspaceIndex implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<IndexSnapshot>();
  /** Fires after every completed run. */
  readonly onDidChange = this.changed.event;

  private readonly runner = new SerialRunner(() => this.index());
  private readonly subscriptions: vscode.Disposable[] = [this.changed];
  private readonly watchers = new Map<string, vscode.Disposable>();
  private snapshot: IndexSnapshot | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
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

  /** Indexes the whole workspace. Calls during a run share one run that starts after it. */
  refresh(): Promise<IndexSnapshot> {
    return this.runner.run();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.refresh().catch((error: unknown) => this.log.error('Indexing failed.', error));
    }, DEBOUNCE_MS);
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
    const errors: string[] = [];
    const patterns = new Map<string, vscode.RelativePattern>();
    const folders = vscode.workspace.workspaceFolders ?? [];

    for (const folder of folders) {
      const report = (message: string) =>
        errors.push(folders.length > 1 ? `${folder.name}: ${message}` : message);
      const { settings, errors: settingErrors } = readSettings(folder.uri);
      const { variants, errors: variantErrors } = compileVariants(settings.variants);
      [...settingErrors, ...variantErrors].forEach(report);
      const options: AnalysisOptions = {
        referenceLanguage: settings.referenceLanguage,
        baseFileLanguage: settings.baseFileLanguage,
        variants,
        severityOverrides: settings.severityOverrides,
        ignoreSameAsReference: settings.ignoreSameAsReference,
      };
      const exclude = excludeGlob(settings.exclude);

      for (const area of settings.areas) {
        const fixed = fixedRoots(area, settings);
        if (!fixed && area.detect) {
          // New roots appear with their marker file (e.g. a new checkout below the workspace folder).
          patterns.set(
            `${folder.uri}|detect|${area.id}`,
            new vscode.RelativePattern(folder, area.detect.glob),
          );
        }
        let areaRoots: readonly string[];
        try {
          areaRoots = fixed ?? (await timed('detect', () => this.detectRoots(folder, area, exclude)));
        } catch (error) {
          this.log.error(`Could not look for roots of ${area.id}.`, error);
          report(
            vscode.l10n.t('The roots of {area} could not be determined: {error}', {
              area: area.label,
              error: messageOf(error),
            }),
          );
          continue;
        }
        for (const root of areaRoots) {
          const base = vscode.Uri.joinPath(folder.uri, root);
          // In nested workspace folders, a root belongs to the innermost one; otherwise it would count twice.
          if (vscode.workspace.getWorkspaceFolder(base)?.uri.toString() !== folder.uri.toString()) {
            continue;
          }
          patterns.set(`${folder.uri}|root|${root}`, new vscode.RelativePattern(base, '**/*'));
          try {
            const paths = await timed('list', () => this.listRoot(folder, area, root, exclude));
            const files = await timed('read', () => this.readFiles(folder, paths, report));
            const analysis = await timed('analyze', () => analyzeRoot(area, root, files, options));
            roots.push({ folder, settings, analysis });
          } catch (error) {
            this.log.error(`Could not index ${area.id} in ${root || '.'}.`, error);
            report(
              vscode.l10n.t('{area} in {root} could not be checked: {error}', {
                area: area.label,
                root: root || '.',
                error: messageOf(error),
              }),
            );
          }
        }
      }
    }

    const snapshot: IndexSnapshot = { roots, errors, durationMs: Date.now() - started };
    if (this.disposed) {
      return snapshot;
    }
    this.watch(patterns);
    this.snapshot = snapshot;
    this.logSummary(snapshot, timings);
    this.changed.fire(snapshot);
    return snapshot;
  }

  private async detectRoots(
    folder: vscode.WorkspaceFolder,
    area: AreaDefinition,
    exclude: string | null,
  ): Promise<string[]> {
    if (!area.detect) {
      return [];
    }
    const markers = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, area.detect.glob),
      exclude,
    );
    return rootsFromMarkers(relativePaths(folder, markers), area.detect.marker);
  }

  /** The files below `root` that belong to the area. */
  private async listRoot(
    folder: vscode.WorkspaceFolder,
    area: AreaDefinition,
    root: string,
    exclude: string | null,
  ): Promise<string[]> {
    const pattern = new vscode.RelativePattern(vscode.Uri.joinPath(folder.uri, root), '**/*');
    const found = await vscode.workspace.findFiles(pattern, exclude);
    return filesToRead(area, root, relativePaths(folder, found));
  }

  /** Unreadable files (e.g. deleted since the listing) are reported and left out. */
  private async readFiles(
    folder: vscode.WorkspaceFolder,
    paths: readonly string[],
    report: (message: string) => void,
  ): Promise<SourceFile[]> {
    const files = await Promise.all(
      paths.map(async (relPath) => {
        try {
          return {
            relPath,
            bytes: await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, relPath)),
          };
        } catch (error) {
          report(
            vscode.l10n.t('{file} could not be read: {error}', { file: relPath, error: messageOf(error) }),
          );
          return undefined;
        }
      }),
    );
    return files.filter((file) => file !== undefined);
  }

  /** Keeps exactly one watcher per pattern of the last run: area roots and the markers of detected areas. */
  private watch(patterns: ReadonlyMap<string, vscode.RelativePattern>): void {
    for (const [key, watcher] of this.watchers) {
      if (!patterns.has(key)) {
        watcher.dispose();
        this.watchers.delete(key);
      }
    }
    for (const [key, pattern] of patterns) {
      if (!this.watchers.has(key)) {
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const schedule = () => this.schedule();
        this.watchers.set(
          key,
          vscode.Disposable.from(
            watcher,
            watcher.onDidCreate(schedule),
            watcher.onDidChange(schedule),
            watcher.onDidDelete(schedule),
          ),
        );
      }
    }
  }

  private logSummary({ roots, errors, durationMs }: IndexSnapshot, timings: Timings): void {
    const bundles = roots.reduce((sum, root) => sum + root.analysis.bundles.length, 0);
    const issues = roots.reduce((sum, root) => sum + root.analysis.issues.length, 0);
    const phases = Object.entries(timings)
      .map(([phase, ms]) => `${phase} ${ms} ms`)
      .join(', ');
    this.log.info(
      `Indexed ${roots.length} roots, ${bundles} bundles, ${issues} findings in ${durationMs} ms (${phases}).`,
    );
    for (const warning of roots.flatMap((root) => root.analysis.warnings)) {
      this.log.warn(warning);
    }
    for (const error of errors) {
      this.log.warn(error);
    }
  }
}

/** Roots from `eduI18n.roots` or the area definition; undefined means the roots are detected. */
function fixedRoots(area: AreaDefinition, settings: Settings): readonly string[] | undefined {
  // Own keys only: an area id like "constructor" must not find Object.prototype.constructor.
  if (Object.hasOwn(settings.roots, area.id)) {
    return settings.roots[area.id];
  }
  return area.roots.length > 0 ? area.roots : undefined;
}

/** Workspace-relative paths of search results; results outside the folder cannot occur and are dropped. */
function relativePaths(folder: vscode.WorkspaceFolder, uris: readonly vscode.Uri[]): string[] {
  return uris.map((uri) => relativeUriPath(folder.uri.path, uri.path)).filter((path) => path !== undefined);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
