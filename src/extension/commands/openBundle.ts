import type { EditorPanel, EditorPanels } from '../panels/editorPanel';
import type { AreaNode } from '../views/areasTree';

/** Opens the editor of the bundle a node of the areas view stands for (clicked or chosen from its menu). */
export function openBundle(editors: EditorPanels, node: unknown): EditorPanel | undefined {
  const target = node as AreaNode | null | undefined;
  return target?.kind === 'bundle' ? editors.open(target.root, target.bundle) : undefined;
}
