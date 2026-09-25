import * as vscode from 'vscode';
import { editProblem } from '../../core/edit/editMessages';
import type { PlanResult } from '../../core/edit/planEdit';
import { parseBundleId, type Bundle } from '../../core/model/bundle';
import type { RootAnalysis } from '../../core/pipeline/analyze';
import { findBundle } from '../panels/bundleTarget';
import type { EditorPanels } from '../panels/editorPanel';
import { rootRef, type FileStore, type Planner } from '../services/fileStore';
import type { IndexedRoot, IndexSnapshot, WorkspaceIndex } from '../services/workspaceIndex';
import { showWriteFailure } from '../services/writeFeedback';
import type { Prompts } from './prompts';

/** What the key and language commands work with. */
export interface KeyCommandContext {
  index: WorkspaceIndex;
  fileStore: FileStore;
  prompts: Prompts;
}

export interface BundleTarget {
  root: IndexedRoot;
  bundle: Bundle;
}

/** Where a command was chosen: a node of the areas view, the context menu of an editor, or the palette. */
export interface TargetSources extends KeyCommandContext {
  editors: EditorPanels;
}

/**
 * The bundle a command acts on, as the index has it now, and the key it starts from: the bundle of the node of
 * the areas view it was chosen on, else of the editor in front (whose context menu names the key), else one the
 * user picks. The argument comes from a menu, and that of an editor from its webview: it only selects, by
 * identifiers, among what the index has.
 */
export async function bundleTarget(
  arg: unknown,
  sources: TargetSources,
): Promise<{ target: BundleTarget; entryId?: string } | undefined> {
  const snapshot = sources.index.current() ?? (await sources.index.refresh());
  const node = nodeTarget(arg, snapshot);
  if (node) {
    return node.bundle ? { target: { root: node.root, bundle: node.bundle } } : undefined;
  }
  const panel = sources.editors.active();
  const found = panel && findBundle(snapshot, panel.target);
  if (found) {
    const entryId = contextKey(arg);
    const known = entryId !== undefined && found.bundle.keys.some((key) => key.id === entryId);
    return { target: found, ...(known ? { entryId } : {}) };
  }
  const picked = await pickBundle(snapshot, sources.prompts);
  return picked && { target: picked };
}

/** A bundle the user picks from all roots. */
export function pickBundle(snapshot: IndexSnapshot, prompts: Prompts): Promise<BundleTarget | undefined> {
  return prompts.pick(
    snapshot.roots.flatMap((root) =>
      root.analysis.bundles.map((bundle) => ({
        label: bundle.name,
        description: rootLabel(root),
        value: { root, bundle },
      })),
    ),
    vscode.l10n.t('Choose a bundle'),
  );
}

/** The root a command acts on: that of the node it was chosen on, of the editor in front, or one the user picks. */
export async function rootTarget(arg: unknown, sources: TargetSources): Promise<IndexedRoot | undefined> {
  const snapshot = sources.index.current() ?? (await sources.index.refresh());
  const node = nodeTarget(arg, snapshot);
  if (node) {
    return node.root;
  }
  const panel = sources.editors.active();
  const found = panel && findBundle(snapshot, panel.target);
  if (found) {
    return found.root;
  }
  const [only, ...others] = snapshot.roots;
  if (only && others.length === 0) {
    return only;
  }
  return sources.prompts.pick(
    snapshot.roots.map((root) => ({ label: rootLabel(root), value: root })),
    vscode.l10n.t('Choose a translation folder'),
  );
}

/** Plans with the bundle as the fresh analysis has it; one that went meanwhile (e.g. a branch switch) is a problem. */
export function inBundle(
  bundleId: string,
  plan: (bundle: Bundle, analysis: RootAnalysis) => PlanResult,
): Planner {
  return (analysis) => {
    const bundle = analysis.bundles.find((candidate) => candidate.id === bundleId);
    return bundle
      ? plan(bundle, analysis)
      : { ok: false, problem: editProblem('missing-bundle', { bundle: parseBundleId(bundleId).name }) };
  };
}

/** Writes a change planned on the fresh state of the root; if nothing was written, tells the user why. */
export async function writeChange(
  context: KeyCommandContext,
  root: IndexedRoot,
  plan: Planner,
): Promise<boolean> {
  const result = await context.fileStore.write(rootRef(root), plan);
  if (!result.ok) {
    void showWriteFailure(result);
  }
  return result.ok;
}

/** "Angular · Frontend/src/assets/i18n": the area and the folder of a root. */
export function rootLabel(root: IndexedRoot): string {
  return `${root.analysis.area.label} · ${root.analysis.root || '.'}`;
}

/** The root and bundle of a node of the areas view, looked up in the index: the node may be from an older run. */
function nodeTarget(
  arg: unknown,
  snapshot: IndexSnapshot,
): { root: IndexedRoot; bundle?: Bundle } | undefined {
  if (!isRecord(arg) || (arg['kind'] !== 'root' && arg['kind'] !== 'bundle') || !isRecord(arg['root'])) {
    return undefined;
  }
  const analysis = arg['root']['analysis'];
  const folder = arg['root']['folder'];
  const uri = isRecord(folder) ? folder['uri'] : undefined;
  if (!isRecord(analysis) || !isRecord(analysis['area']) || !(uri instanceof vscode.Uri)) {
    return undefined;
  }
  const areaId = analysis['area']['id'];
  const root = snapshot.roots.find(
    (candidate) =>
      candidate.folder.uri.toString() === uri.toString() &&
      candidate.analysis.area.id === areaId &&
      candidate.analysis.root === analysis['root'],
  );
  if (!root || arg['kind'] === 'root') {
    return root && { root };
  }
  const id = isRecord(arg['bundle']) ? arg['bundle']['id'] : undefined;
  return { root, bundle: root.analysis.bundles.find((bundle) => bundle.id === id) };
}

/** The key an editor's context menu names: its webview puts it on the rows and cards (`data-vscode-context`). */
function contextKey(arg: unknown): string | undefined {
  return isRecord(arg) && typeof arg['entryId'] === 'string' ? arg['entryId'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
