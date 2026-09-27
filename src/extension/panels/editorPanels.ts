import * as vscode from 'vscode';
import type { Bundle } from '../../core/model/bundle';
import { copyPanelState, isPanelState, type PanelState } from '../../shared/protocol';
import type { IndexedRoot } from '../services/workspaceIndex';
import { EDITOR_VIEW_TYPE, EditorPanel, type EditorServices } from './editorPanel';

/** The editors of the bundles: one per bundle, restored after a restart, updated after every index run. */
export class EditorPanels implements vscode.Disposable {
  private readonly panels = new Set<EditorPanel>();
  private readonly subscriptions: vscode.Disposable[];

  constructor(private readonly services: EditorServices) {
    this.subscriptions = [
      services.index.onDidChange((snapshot) => {
        for (const panel of this.panels) {
          panel
            .update(snapshot)
            .catch((error: unknown) => services.log.error('Could not update an editor.', error));
        }
      }),
      vscode.window.registerWebviewPanelSerializer(EDITOR_VIEW_TYPE, {
        deserializeWebviewPanel: async (panel, state) => void this.restore(panel, state),
      }),
    ];
  }

  /** Shows the editor of a bundle; if it is open, it comes to the front. */
  open(root: IndexedRoot, bundle: Bundle): EditorPanel {
    const target: PanelState = { folder: root.folder.uri.toString(), bundleId: bundle.id };
    const open = this.find(target);
    if (open) {
      open.panel.reveal();
      return open;
    }
    const panel = vscode.window.createWebviewPanel(EDITOR_VIEW_TYPE, bundle.name, vscode.ViewColumn.Active, {
      retainContextWhenHidden: true,
    });
    return this.add(panel, target);
  }

  /**
   * Takes over a panel VS Code restored after a restart. One whose state is not readable is closed, and so is one
   * whose bundle got its editor meanwhile: VS Code restores a tab only when it is first shown, which may be
   * after the bundle was opened from the tree.
   */
  restore(panel: vscode.WebviewPanel, state: unknown): EditorPanel | undefined {
    if (!isPanelState(state)) {
      this.services.log.warn('Closed a restored editor whose saved state is not readable.');
      panel.dispose();
      return undefined;
    }
    const open = this.find(state);
    if (open) {
      panel.dispose();
      open.panel.reveal();
      return open;
    }
    return this.add(panel, copyPanelState(state));
  }

  /** The editor in front, e.g. the one whose context menu was opened. */
  active(): EditorPanel | undefined {
    return [...this.panels].find((editor) => editor.panel.active);
  }

  /** Leaves the panels open: VS Code restores them in the next session. */
  dispose(): void {
    for (const panel of this.panels) {
      panel.dispose();
    }
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private find(target: PanelState): EditorPanel | undefined {
    return [...this.panels].find(
      (panel) => panel.target.folder === target.folder && panel.target.bundleId === target.bundleId,
    );
  }

  private add(panel: vscode.WebviewPanel, target: PanelState): EditorPanel {
    const editor = new EditorPanel(panel, target, this.services);
    this.panels.add(editor);
    panel.onDidDispose(() => {
      this.panels.delete(editor);
      editor.dispose();
    });
    return editor;
  }
}
