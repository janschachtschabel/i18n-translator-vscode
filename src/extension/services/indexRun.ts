import * as vscode from 'vscode';
import type { AreaDefinition } from '../../core/area/areaDefinition';
import { analysisOptions, type Settings } from '../../core/config/settings';
import type { AreaId } from '../../core/model/types';
import { analyzeRoot, type RootAnalysis, type SourceFile } from '../../core/pipeline/analyze';
import { excludeGlob, readBackupSettings, readSettings } from '../config';
import { messageOf } from './errors';
import type { WatchedPattern } from './indexWatchers';
import { detectRoots, fixedRoots, listRoot, readFiles, revisionsOf, type RootLimits } from './rootFiles';

// What a run of the index reads and finds: the roots of each area in each workspace folder, with their analyses and
// what could not be read. The index (workspaceIndex.ts) decides when to run, and keeps and publishes the result.

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

/** Milliseconds per phase of one run, summed over all roots; logged to find slow steps. */
interface Timings {
  detect: number;
  list: number;
  read: number;
  analyze: number;
}

/** Runs a step of a run and adds its milliseconds to its phase. */
type Timed = <T>(phase: keyof Timings, work: () => T | Promise<T>) => Promise<T>;

const untimed: Timed = async (_phase, work) => work();

/** The timings of a run, and how its steps add to them. */
function phaseTimer(): { timings: Timings; timed: Timed } {
  const timings: Timings = { detect: 0, list: 0, read: 0, analyze: 0 };
  const timed: Timed = async (phase, work) => {
    const phaseStarted = Date.now();
    try {
      return await work();
    } finally {
      timings[phase] += Date.now() - phaseStarted;
    }
  };
  return { timings, timed };
}

/** What a run needs from the index: its log, the limits of a repository, and what a change of a watched file sets off. */
export interface RunContext {
  log: vscode.LogOutputChannel;
  limits: RootLimits;
  /** A marker file came or went: roots may have appeared or gone. */
  onMarker: () => void;
  /** A file below a root was created, changed or deleted. */
  onRootFile: (ref: RootRef, uri: vscode.Uri) => void;
}

/** What a full run found, before the index takes it as its state. */
export interface FullRun {
  roots: IndexedRoot[];
  /** What it could not use: settings, and the search for roots. */
  generalErrors: string[];
  /** Per root, by {@link keyOf}: the files it could not read, or why the root could not be indexed. */
  rootErrors: Map<string, string[]>;
  /** Per root, by {@link keyOf}: the revision of each file it read. */
  revisions: Map<string, ReadonlyMap<string, string>>;
  /** The files to follow, by a key of their own. */
  watched: Map<string, WatchedPattern>;
  timings: Timings;
}

/** Looks for the roots of every area in every workspace folder, and reads and checks their files. */
export async function runFull(context: RunContext): Promise<FullRun> {
  const { timings, timed } = phaseTimer();
  const run: FullRun = {
    roots: [],
    generalErrors: [...readBackupSettings().errors],
    rootErrors: new Map(),
    revisions: new Map(),
    watched: new Map(),
    timings,
  };
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    await indexFolder(context, folder, run, timed);
  }
  return run;
}

/** Indexes the roots of each area of a workspace folder into `run`, with the watchers that keep them current. */
async function indexFolder(
  context: RunContext,
  folder: vscode.WorkspaceFolder,
  run: FullRun,
  timed: Timed,
): Promise<void> {
  const { settings, errors: settingErrors } = readSettings(folder.uri);
  const { options, errors: variantErrors } = analysisOptions(settings);
  run.generalErrors.push(...[...settingErrors, ...variantErrors].map((error) => inFolder(folder, error)));
  const exclude = excludeGlob(settings.exclude);

  for (const area of settings.areas) {
    const fixed = fixedRoots(area, settings);
    if (!fixed && area.detect) {
      // New roots appear with their marker file (e.g. a new checkout below the workspace folder).
      run.watched.set(`${folder.uri}|detect|${area.id}`, {
        pattern: new vscode.RelativePattern(folder, area.detect.glob),
        onChange: context.onMarker,
        contents: false,
      });
    }
    for (const root of fixed ?? (await detect(context, folder, area, exclude, run, timed))) {
      const base = vscode.Uri.joinPath(folder.uri, root);
      // In nested workspace folders, a root belongs to the innermost one; otherwise it would count twice.
      if (vscode.workspace.getWorkspaceFolder(base)?.uri.toString() !== folder.uri.toString()) {
        continue;
      }
      const ref: RootRef = { folder: folder.uri, areaId: area.id, root };
      const key = keyOf(ref);
      run.watched.set(`${key}|root`, {
        pattern: new vscode.RelativePattern(base, '**/*'),
        onChange: (uri) => context.onRootFile(ref, uri),
        contents: true,
      });
      const errors: string[] = [];
      run.rootErrors.set(key, errors);
      try {
        const files = await readRoot(context, folder, area, root, exclude, errors, timed);
        const analysis = await timed('analyze', () => analyzeRoot(area, root, files, options));
        run.roots.push({ folder, settings, analysis });
        run.revisions.set(key, revisionsOf(files));
      } catch (error) {
        errors.push(notIndexed(context, folder, area, root, error));
      }
    }
  }
}

/** The roots of an area by its marker files; none, with the reason among the general errors, if the search failed. */
async function detect(
  context: RunContext,
  folder: vscode.WorkspaceFolder,
  area: AreaDefinition,
  exclude: string | null,
  run: FullRun,
  timed: Timed,
): Promise<readonly string[]> {
  try {
    return await timed('detect', () => detectRoots(folder, area, exclude, context.limits));
  } catch (error) {
    context.log.error(`Could not look for roots of ${area.id}.`, error);
    run.generalErrors.push(
      inFolder(
        folder,
        vscode.l10n.t('The roots of {area} could not be determined: {error}', {
          area: area.label,
          error: messageOf(error),
        }),
      ),
    );
    return [];
  }
}

/** Lists and reads the files of a root; what cannot be read goes to `errors`. */
export async function readRoot(
  context: RunContext,
  folder: vscode.WorkspaceFolder,
  area: AreaDefinition,
  root: string,
  exclude: string | null,
  errors: string[],
  timed: Timed = untimed,
): Promise<SourceFile[]> {
  const paths = await timed('list', () => listRoot(folder, area, root, exclude, context.limits));
  return timed('read', () =>
    readFiles(folder, paths, (error) => errors.push(inFolder(folder, error)), context.limits),
  );
}

/** Logs why a root could not be indexed; the message names it as not checked. */
export function notIndexed(
  context: RunContext,
  folder: vscode.WorkspaceFolder,
  area: AreaDefinition,
  root: string,
  error: unknown,
): string {
  context.log.error(`Could not index ${area.id} in ${root || '.'}.`, error);
  return notChecked(folder, area, root, error);
}

/** Logs a full run: what it indexed and how long each phase took, the warnings of the analyses and the errors. */
export function logRun(log: vscode.LogOutputChannel, snapshot: IndexSnapshot, timings: Timings): void {
  const { roots } = snapshot;
  const phases = Object.entries(timings)
    .map(([phase, ms]) => `${phase} ${ms} ms`)
    .join(', ');
  const bundles = roots.reduce((sum, root) => sum + root.analysis.bundles.length, 0);
  const issues = roots.reduce((sum, root) => sum + root.analysis.issues.length, 0);
  log.info(
    `Indexed ${roots.length} roots, ${bundles} bundles, ${issues} findings in ${snapshot.durationMs} ms (${phases}).`,
  );
  for (const warning of roots.flatMap((root) => root.analysis.warnings)) {
    log.warn(warning);
  }
  for (const error of snapshot.errors) {
    log.warn(error);
  }
}

/** The message about a root that a run could not index. */
function notChecked(
  folder: vscode.WorkspaceFolder,
  area: AreaDefinition,
  root: string,
  error: unknown,
): string {
  return inFolder(
    folder,
    vscode.l10n.t('{area} in {root} could not be checked: {error}', {
      area: area.label,
      root: root || '.',
      error: messageOf(error),
    }),
  );
}

/** A message about a folder, named when the workspace has several. */
function inFolder(folder: vscode.WorkspaceFolder, message: string): string {
  return (vscode.workspace.workspaceFolders?.length ?? 0) > 1 ? `${folder.name}: ${message}` : message;
}

/** The key of a root in the maps of the index and of a run. */
export function keyOf(ref: RootRef): string {
  return JSON.stringify([ref.folder.toString(), ref.areaId, ref.root]);
}
