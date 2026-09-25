import type { Bundle } from '../../core/model/bundle';
import type { PanelState } from '../../shared/protocol';
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
