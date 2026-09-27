import * as vscode from 'vscode';
import { compileFilePattern } from '../../core/area/filePattern';
import { applyChanges, type FileWrite } from '../../core/edit/applyChanges';
import type { EditProblem } from '../../core/edit/editMessages';
import type { PlanResult } from '../../core/edit/planEdit';
import type { FormatAdapter } from '../../core/formats/adapter';
import { ADAPTERS } from '../../core/formats/registry';
import type { LoadedFile } from '../../core/model/bundle';
import type { RootAnalysis } from '../../core/pipeline/analyze';
import { insideRoot, relativeUriPath } from './uriPaths';
import type { IndexedRoot } from './workspaceIndex';

// What a write concerns: the files a plan changes in a root, and the bundles and files they belong to. How the files
// are checked and written, all or none, is the file store's (fileStore.ts).

/** Plans an edit on the current state of a root. The store plans again when files changed on disk (B5). */
export type Planner = (analysis: RootAnalysis) => PlanResult;

/** A file that a planned write changes: where it is, the change, and the bytes it gets. */
export interface Target {
  uri: vscode.Uri;
  write: FileWrite;
  bytes: Uint8Array;
}

/** What a plan writes in an indexed root: its files with their bytes, nothing, or why it cannot be written. */
export type PlannedWrite =
  | { targets: Target[]; adapter: FormatAdapter }
  | { ok: true }
  | { ok: false; reason: 'problem'; problem: EditProblem }
  | { ok: false; reason: 'error'; message: string };

/** Plans the edit on the indexed texts of a root and turns it into the files it writes, all inside the root. */
export function planTargets(indexed: IndexedRoot, plan: Planner): PlannedWrite {
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
  return {
    adapter,
    targets: applied.writes.map((write) => ({
      uri: vscode.Uri.joinPath(indexed.folder.uri, ...write.relPath.split('/')),
      write,
      bytes: adapter.encode(write.after),
    })),
  };
}

/** Whether a file lies inside the area root of an indexed workspace folder. */
export function inRoot(uri: vscode.Uri, indexed: IndexedRoot): boolean {
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
export function bundlesOf(analysis: RootAnalysis, relPaths: readonly string[]): number {
  return new Set(bundleNames(analysis, relPaths)).size;
}

/** The files of the bundles that `relPaths` belong to, as the analysis read them. */
export function bundleFiles(analysis: RootAnalysis, relPaths: readonly string[]): LoadedFile[] {
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
