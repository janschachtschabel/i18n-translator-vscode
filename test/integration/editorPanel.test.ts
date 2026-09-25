import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { EditorPanel } from '../../src/extension/panels/editorPanel';
import type { HostToWebview } from '../../src/shared/protocol';
import { activateExtension, waitFor } from './helpers';

function editorTabs(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('eduI18n.editor'),
    )
    .map((tab) => tab.label);
}

/** The next message of `type` the host sends to the webview. */
function nextPost<T extends HostToWebview['type']>(
  panel: EditorPanel,
  type: T,
): Promise<Extract<HostToWebview, { type: T }>> {
  return waitFor(panel.onDidPost, (message) => message.type === type) as Promise<
    Extract<HostToWebview, { type: T }>
  >;
}

suite('editor panel', () => {
  teardown(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  test('opens one editor per bundle from the areas view; its webview loads and gets the bundle', async () => {
    const { index, views } = await activateExtension();
    await index.refresh();
    const [root] = await views.areas.getChildren();
    const common = (await views.areas.getChildren(root)).find(
      (node) => node.kind === 'bundle' && node.bundle.name === 'common',
    );
    assert.ok(common);
    const { command } = views.areas.getTreeItem(common);
    assert.strictEqual(command?.command, 'eduI18n.openBundle');

    const panel = await vscode.commands.executeCommand<EditorPanel>(
      command.command,
      ...(command.arguments ?? []),
    );
    // Only the webview's script (allowed by the CSP) sends `ready`; the host answers with init and the bundle.
    const [init, bundle] = await Promise.all([nextPost(panel, 'init'), nextPost(panel, 'bundle')]);
    assert.strictEqual(init.panelState.bundleId, bundle.model.bundleId);
    assert.strictEqual(bundle.model.name, 'common');
    assert.strictEqual(bundle.model.rows.length, 14);

    const again = await vscode.commands.executeCommand<EditorPanel>(
      command.command,
      ...(command.arguments ?? []),
    );
    assert.strictEqual(again, panel);
    assert.deepStrictEqual(editorTabs(), ['common']);
  });

  test('restores an editor from the state its webview kept', async () => {
    const { index, editors } = await activateExtension();
    const snapshot = await index.refresh();
    const root = snapshot.roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const state = { folder: root.folder.uri.toString(), bundleId: common.id };

    const restored = editors.restore(
      vscode.window.createWebviewPanel('eduI18n.editor', '', vscode.ViewColumn.One),
      state,
    );
    assert.ok(restored);
    assert.strictEqual((await nextPost(restored, 'bundle')).model.name, 'common');
    assert.strictEqual(restored.panel.title, 'common');

    const gone = editors.restore(
      vscode.window.createWebviewPanel('eduI18n.editor', '', vscode.ViewColumn.One),
      {
        ...state,
        bundleId: JSON.stringify([root.analysis.area.id, root.analysis.root, 'gone']),
      },
    );
    assert.ok(gone);
    assert.deepStrictEqual(await nextPost(gone, 'missing'), { type: 'missing', name: 'gone' });
  });

  test('closes a restored editor whose state it cannot read', async () => {
    const { editors } = await activateExtension();
    const panel = vscode.window.createWebviewPanel('eduI18n.editor', '', vscode.ViewColumn.One);
    const disposed = new Promise<void>((resolve) => panel.onDidDispose(() => resolve()));
    assert.strictEqual(editors.restore(panel, { bundleId: 42 }), undefined);
    await disposed;
  });
});
