import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { planEdit } from '../../src/core/edit/planEdit';
import { keyFromSegments } from '../../src/core/model/keys';
import type { EditorPanel } from '../../src/extension/panels/editorPanel';
import { rootRef } from '../../src/extension/services/fileStore';
import { sameBytes } from '../../src/extension/services/files';
import { DEFAULT_UI_STATE, type HostToWebview, type UiState } from '../../src/shared/protocol';
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

  test('keeps the view state of a bundle for the next time its editor opens', async () => {
    const { index, editors } = await activateExtension();
    const root = (await index.refresh()).roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const state: UiState = { layout: 'list', wrap: true, hiddenLocales: ['it'] };

    const first = editors.open(root, common);
    await first.receive({ type: 'uiState', state });
    first.panel.dispose();
    const second = editors.open(root, common);
    assert.deepStrictEqual((await nextPost(second, 'init')).uiState, state);
    // The workspace state outlives the test run.
    await second.receive({ type: 'uiState', state: DEFAULT_UI_STATE });
  });

  test('undoes the last change from the editor', async () => {
    const { index, editors, fileStore } = await activateExtension();
    const root = (await index.refresh()).roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const fr = vscode.Uri.joinPath(root.folder.uri, common.file('fr')!.relPath);
    const before = await vscode.workspace.fs.readFile(fr);
    const written = await fileStore.write(rootRef(root), (analysis) =>
      planEdit(
        analysis.bundles.find((bundle) => bundle.id === common.id)!,
        {
          kind: 'setText',
          entryId: keyFromSegments(['ASK']).id,
          locale: 'fr',
          value: 'Demander ?',
        },
      ),
    );
    assert.deepStrictEqual(written, { ok: true });
    assert.ok(!sameBytes(await vscode.workspace.fs.readFile(fr), before));

    await editors.open(root, common).receive({ type: 'undo' });
    assert.ok(sameBytes(await vscode.workspace.fs.readFile(fr), before));
  });
});
