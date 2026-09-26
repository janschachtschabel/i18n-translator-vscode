import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { activateExtension, nextPost } from './helpers';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

suite('external changes', () => {
  teardown(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  test('a change of fr.json on disk reaches the open editor as a patch of the changed row', async () => {
    const { index, editors } = await activateExtension();
    const root = (await index.refresh()).roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const fr = vscode.Uri.joinPath(root.folder.uri, common.file('fr')!.relPath);
    const editor = editors.open(root, common);
    await nextPost(editor, 'bundle');
    const before = await vscode.workspace.fs.readFile(fr);
    const patched = nextPost(editor, 'patch');
    try {
      // As another program would change it: the watcher notices.
      const text = decoder.decode(before).replace('"OK": "OK"', '"OK": "D’accord"');
      await vscode.workspace.fs.writeFile(fr, encoder.encode(text));
      const { patch } = await patched;
      assert.deepStrictEqual(
        patch.rows.map((row) => [row.key, row.cells['fr']?.value]),
        [['OK', 'D’accord']],
      );
      assert.deepStrictEqual([patch.order, patch.locales, patch.issues], [undefined, undefined, undefined]);
    } finally {
      const restored = nextPost(editor, 'patch');
      await vscode.workspace.fs.writeFile(fr, before);
      await restored;
    }
  });
});
