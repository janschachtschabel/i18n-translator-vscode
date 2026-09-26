import { parseBundleId } from '../../core/model/bundle';
import type { PanelState } from '../../shared/protocol';
import type { IndexSnapshot } from '../services/workspaceIndex';

/**
 * The title of a bundle's editor: the bundle, and where it lies when the workspace has several roots, so that
 * the editors of two installations can be told apart: the workspace folder if there are several, the root if
 * the folder has several.
 */
export function editorTitle(snapshot: IndexSnapshot | undefined, target: PanelState): string {
  const { root, name } = parseBundleId(target.bundleId);
  const roots = snapshot?.roots ?? [];
  const inFolder = roots.filter((indexed) => indexed.folder.uri.toString() === target.folder);
  const folders = new Set(roots.map((indexed) => indexed.folder.uri.toString()));
  const where = [
    ...(folders.size > 1 && inFolder[0] ? [inFolder[0].folder.name] : []),
    ...(inFolder.length > 1 ? [root || '.'] : []),
  ];
  return where.length > 0 ? `${name} (${where.join(': ')})` : name;
}
