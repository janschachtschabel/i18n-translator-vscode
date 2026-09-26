import { editProblem } from '../../core/edit/editMessages';
import type { PlanResult } from '../../core/edit/planEdit';
import { parseBundleId, type Bundle } from '../../core/model/bundle';
import type { RootAnalysis } from '../../core/pipeline/analyze';
import type { PanelState } from '../../shared/protocol';
import type { Planner } from '../services/fileStore';
import type { IndexedRoot, IndexSnapshot } from '../services/workspaceIndex';

/** The bundle an editor shows, with its root, as an index run found it; undefined if it is gone. */
export function findBundle(
  snapshot: IndexSnapshot,
  target: PanelState,
): { root: IndexedRoot; bundle: Bundle } | undefined {
  for (const root of snapshot.roots) {
    const bundle =
      root.folder.uri.toString() === target.folder
        ? root.analysis.bundles.find((candidate) => candidate.id === target.bundleId)
        : undefined;
    if (bundle) {
      return { root, bundle };
    }
  }
  return undefined;
}

/** Plans with the bundle as the fresh analysis has it; one that went meanwhile (e.g. a branch switch) is a problem. */
export function inBundle(
  bundleId: string,
  plan: (bundle: Bundle, analysis: RootAnalysis) => PlanResult,
): Planner {
  return (analysis) => {
    const bundle = analysis.bundles.find((candidate) => candidate.id === bundleId);
    return bundle ? plan(bundle, analysis) : { ok: false, problem: missingBundle(bundleId) };
  };
}

/** The problem of a bundle that is no longer in the workspace. */
export function missingBundle(bundleId: string) {
  return editProblem('missing-bundle', { bundle: parseBundleId(bundleId).name });
}
