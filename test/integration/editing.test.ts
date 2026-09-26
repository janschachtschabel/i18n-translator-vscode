import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import { applyEdit } from '../../src/extension/panels/editHandler';
import { FileStore } from '../../src/extension/services/fileStore';
import { sameBytes } from '../../src/extension/services/files';
import { activateExtension, answering, nextPost } from './helpers';

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
    await api.fileStore.indexed();
    assert.ok(!mismatch());

    await editor.receive({ type: 'undo' });
    assert.ok(sameBytes(await vscode.workspace.fs.readFile(fr), before));
  });

  /** Asks the edit handler of the common editor as the editor would, answering its questions with `prompts`. */
  async function send(
    value: string,
    before: string | null,
    locale: string,
    prompts = answering(),
    fileStore: FileStore = api.fileStore,
  ) {
    const root = (await api.index.refresh()).roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const target = { folder: root.folder.uri.toString(), bundleId: common.id };
    const request = { type: 'edit' as const, requestId: 'r', entryId: ERROR_TITLE, locale, value, before };
    const file = vscode.Uri.joinPath(root.folder.uri, common.file(locale)!.relPath);
    const bytes = await vscode.workspace.fs.readFile(file);
    const answer = await applyEdit(request, target, { index: api.index, fileStore, prompts });
    return { answer, prompts, file, bytes };
  }

  test('takes an edit sent against the text just written, before its file is indexed again', async () => {
    const root = (await api.index.refresh()).roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const target = { folder: root.folder.uri.toString(), bundleId: common.id };
    const services = { index: api.index, fileStore: api.fileStore, prompts: answering() };
    const request = (value: string, before: string) => ({
      type: 'edit' as const,
      requestId: 'r',
      entryId: ERROR_TITLE,
      locale: 'fr',
      value,
      before,
    });
    const first = await applyEdit(request('Erreur ({{date}})', 'Erreur ({{data}})'), target, services);
    // A write answers before its files are indexed again; the editor sends the next text against it at once.
    const second = await applyEdit(request('Erreur du {{date}}', 'Erreur ({{date}})'), target, services);
    try {
      assert.deepStrictEqual([first.ok, second.ok], [true, true], second.message);
    } finally {
      for (const answer of [second, first]) {
        if (answer.ok) {
          assert.equal((await api.fileStore.undo())?.ok, true);
        }
      }
    }
  });

  test('asks nothing and writes nothing in Restricted Mode', async () => {
    const log = vscode.window.createOutputChannel('edu-sharing i18n (untrusted)', { log: true });
    const untrusted = new FileStore(api.index, log, { trusted: () => false });
    try {
      const { answer, prompts, file, bytes } = await send(
        '',
        'Erreur ({{data}})',
        'fr',
        answering(true),
        untrusted,
      );
      assert.equal(answer.ok, false);
      assert.deepEqual(prompts.asked, []);
      assert.ok(sameBytes(await vscode.workspace.fs.readFile(file), bytes));
    } finally {
      log.dispose();
    }
  });

  test('asks before clearing a text, which deletes it in that language only (B2)', async () => {
    const declined = await send('', 'Erreur ({{data}})', 'fr', answering(false));
    assert.deepStrictEqual(declined.answer, { ok: false });
    assert.deepStrictEqual(declined.prompts.asked, [
      'Delete the fr text of ERROR_TITLE? Without it, the text in de appears.',
    ]);
    assert.ok(sameBytes(await vscode.workspace.fs.readFile(declined.file), declined.bytes));

    const confirmed = await send('', 'Erreur ({{data}})', 'fr', answering(true));
    try {
      assert.deepStrictEqual(confirmed.answer, { ok: true });
      assert.ok(!decoder.decode(await vscode.workspace.fs.readFile(confirmed.file)).includes('ERROR_TITLE'));
    } finally {
      assert.equal((await api.fileStore.undo())?.ok, true);
    }
  });

  test('asks nothing when the plan refuses: an empty reference, or a text that changed (a conflict)', async () => {
    const reference = await send('', 'Fehler ({{date}})', 'de');
    assert.deepStrictEqual([reference.answer.ok, reference.prompts.asked], [false, []]);
    assert.match(reference.answer.message ?? '', /cannot be empty/);
    const stale = await send('', 'Erreur (ancien)', 'fr');
    assert.deepStrictEqual([stale.answer.ok, stale.answer.conflict, stale.prompts.asked], [false, true, []]);
  });

  test('answers an edit whose handling fails, so that its cell does not wait', async () => {
    const { editor } = await openCommon();
    const latest = api.index.latest;
    api.index.latest = () => Promise.reject(new Error('index unreachable'));
    try {
      const answer = nextPost(editor, 'writeResult');
      await editor.receive({
        type: 'edit',
        requestId: 'r9',
        entryId: ERROR_TITLE,
        locale: 'fr',
        value: 'x',
        before: null,
      });
      assert.deepStrictEqual(await answer, {
        type: 'writeResult',
        requestId: 'r9',
        ok: false,
        message: 'The change could not be saved: index unreachable',
      });
    } finally {
      api.index.latest = latest;
    }
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

  // A save can end after its editor closed; its answer goes nowhere, and nothing fails (audit API-02).
  test('answers nothing into an editor that is closed, and does not fail', async () => {
    const { editor } = await openCommon();
    editor.panel.dispose();
    await editor.receive({
      type: 'edit',
      requestId: 'r4',
      entryId: 'ERROR_TITLE',
      locale: 'fr',
      value: 'x',
      before: null,
    });
  });
});
