import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import { sameBytes } from '../../src/extension/services/files';
import { activateExtension, nextPost } from './helpers';

const ERROR_TITLE = keyFromSegments(['ERROR_TITLE']).id;
const decoder = new TextDecoder();

suite('editing', () => {
  let api: ExtensionApi;

  suiteSetup(async () => {
    api = await activateExtension();
  });
  teardown(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  async function openCommon() {
    const root = (await api.index.refresh()).roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const fr = vscode.Uri.joinPath(root.folder.uri, common.file('fr')!.relPath);
    return { editor: api.editors.open(root, common), fr };
  }

  const mismatch = () =>
    api.index
      .current()!
      .roots[0]!.analysis.issues.some(
        (issue) =>
          issue.rule === 'placeholder-mismatch' && issue.entryId === ERROR_TITLE && issue.locale === 'fr',
      );

  test('an edit changes one line of fr.json and fixes its finding; undo brings the old bytes back', async () => {
    const { editor, fr } = await openCommon();
    const before = await vscode.workspace.fs.readFile(fr);
    assert.ok(mismatch());

    const answer = nextPost(editor, 'writeResult');
    await editor.receive({
      type: 'edit',
      requestId: 'r1',
      entryId: ERROR_TITLE,
      locale: 'fr',
      value: 'Erreur ({{date}})',
      before: 'Erreur ({{data}})',
    });
    assert.deepStrictEqual(await answer, { type: 'writeResult', requestId: 'r1', ok: true });

    const oldLines = decoder.decode(before).split('\n');
    const newLines = decoder.decode(await vscode.workspace.fs.readFile(fr)).split('\n');
    assert.strictEqual(newLines.length, oldLines.length);
    assert.deepStrictEqual(
      newLines.filter((line, index) => line !== oldLines[index]),
      ['  "ERROR_TITLE": "Erreur ({{date}})",'],
    );
    assert.ok(!mismatch());

    await editor.receive({ type: 'undo' });
    assert.ok(sameBytes(await vscode.workspace.fs.readFile(fr), before));
  });

  test('a text that changed in the meantime is not overwritten; the answer says why', async () => {
    const { editor, fr } = await openCommon();
    const before = await vscode.workspace.fs.readFile(fr);
    const answer = nextPost(editor, 'writeResult');
    await editor.receive({
      type: 'edit',
      requestId: 'r2',
      entryId: ERROR_TITLE,
      locale: 'fr',
      value: 'Erreur ({{date}})',
      before: 'Erreur (ancien)',
    });
    const { ok, message } = await answer;
    assert.strictEqual(ok, false);
    assert.match(message ?? '', /ERROR_TITLE/);
    assert.ok(sameBytes(await vscode.workspace.fs.readFile(fr), before));
  });

  test('an edit that cannot be read is answered all the same, so the cell does not wait', async () => {
    const { editor } = await openCommon();
    const answer = nextPost(editor, 'writeResult');
    await editor.receive({
      type: 'edit',
      requestId: 'r3',
      entryId: 'ERROR_TITLE',
      locale: 'fr',
      value: 'x',
      before: null,
    });
    const { requestId, ok, message } = await answer;
    assert.deepStrictEqual([requestId, ok], ['r3', false]);
    assert.ok(message);
  });
});
