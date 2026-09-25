import * as assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import * as vscode from 'vscode';
import { planAddLanguage, planEdit, type BundleEdit } from '../../src/core/edit/planEdit';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import { rootRef, type Planner, type RootRef } from '../../src/extension/services/fileStore';
import { activateExtension, workspaceUri } from './helpers';

const I18N = 'Frontend/src/assets/i18n';
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const id = (dotted: string) => keyFromSegments(dotted.split('.')).id;
const uriOf = (bundle: string, locale: string) => workspaceUri(`${I18N}/${bundle}/${locale}.json`);
const read = async (uri: vscode.Uri) => decoder.decode(await vscode.workspace.fs.readFile(uri));
const exists = (uri: vscode.Uri) =>
  vscode.workspace.fs.stat(uri).then(
    () => true,
    () => false,
  );

/** Plans an edit of one bundle, the way the editor does. */
const edit =
  (bundle: string, change: BundleEdit): Planner =>
  (analysis) =>
    planEdit(
      analysis.bundles.find((candidate) => candidate.name === bundle)!,
      change,
    );

const setAsk = (value: string, before?: string): Planner =>
  edit('common', { kind: 'setText', entryId: id('ASK'), locale: 'fr', value, ...(before ? { before } : {}) });

/** Changes the file on disk behind the index's back, as another editor or a git pull would. */
async function changeOnDisk(uri: vscode.Uri, from: string, to: string): Promise<void> {
  const text = await read(uri);
  assert.ok(text.includes(from), `${uri.path} contains ${from}`);
  await vscode.workspace.fs.writeFile(uri, encoder.encode(text.replace(from, to)));
}

suite('FileStore', () => {
  let api: ExtensionApi;
  let ref: RootRef;
  /** Every translation file as the suite found it; each test puts them back. */
  let original: [vscode.Uri, Uint8Array][];
  const translationFiles = () => vscode.workspace.findFiles(`${I18N}/**/*.json`);

  suiteSetup(async () => {
    api = await activateExtension();
    const snapshot = api.index.current() ?? (await api.index.refresh());
    ref = rootRef(snapshot.roots[0]!);
    original = await Promise.all(
      (await translationFiles()).map(async (uri) => [uri, await vscode.workspace.fs.readFile(uri)] as const),
    ).then((files) => files.map(([uri, bytes]) => [uri, bytes]));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    const known = new Set(original.map(([uri]) => uri.toString()));
    for (const uri of await translationFiles()) {
      if (!known.has(uri.toString())) {
        await vscode.workspace.fs.delete(uri);
      }
    }
    for (const [uri, bytes] of original) {
      await vscode.workspace.fs.writeFile(uri, bytes);
    }
    await api.index.refresh();
  });

  test('changes exactly one line for one text', async () => {
    const fr = uriOf('common', 'fr');
    const before = (await read(fr)).split('\n');
    assert.deepEqual(await api.fileStore.write(ref, setAsk('Continuer ?')), { ok: true });
    const after = (await read(fr)).split('\n');
    assert.equal(after.length, before.length);
    assert.deepEqual(
      after.filter((line, index) => line !== before[index]),
      ['  "ASK": "Continuer ?",'],
    );
  });

  test('writes nothing while a file has unsaved changes in an editor', async () => {
    const fr = uriOf('common', 'fr');
    const before = await read(fr);
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fr));
    await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), ' '));
    const result = await api.fileStore.write(ref, setAsk('Continuer ?'));
    assert.ok(!result.ok && result.reason === 'dirty');
    assert.deepEqual(
      result.files.map((uri) => uri.toString()),
      [fr.toString()],
    );
    assert.equal(await read(fr), before);
  });

  test('plans again on the new text when another key changed on disk in the meantime', async () => {
    const fr = uriOf('common', 'fr');
    await changeOnDisk(fr, '"MINUTE": "Minute"', '"MINUTE": "Minuto"');
    const result = await api.fileStore.write(ref, setAsk('Continuer ?', 'Voulez-vous continuer ?'));
    assert.deepEqual(result, { ok: true });
    const text = await read(fr);
    assert.ok(text.includes('"MINUTE": "Minuto"') && text.includes('"ASK": "Continuer ?"'), text);
  });

  test('reports a conflict when the same text changed on disk in the meantime', async () => {
    const fr = uriOf('common', 'fr');
    await changeOnDisk(fr, '"ASK": "Voulez-vous continuer ?"', '"ASK": "Autre chose ?"');
    const result = await api.fileStore.write(ref, setAsk('Continuer ?', 'Voulez-vous continuer ?'));
    assert.ok(!result.ok && result.reason === 'problem');
    assert.equal(result.problem.code, 'changed');
    assert.ok((await read(fr)).includes('"ASK": "Autre chose ?"'));
  });

  test('undoes the last write byte for byte', async () => {
    const fr = uriOf('common', 'fr');
    const before = await vscode.workspace.fs.readFile(fr);
    assert.deepEqual(await api.fileStore.write(ref, setAsk('Continuer ?')), { ok: true });
    assert.deepEqual(await api.fileStore.undo(), { ok: true });
    assert.deepEqual(await vscode.workspace.fs.readFile(fr), before);
  });

  test('does not undo a write whose file changed since', async () => {
    const fr = uriOf('common', 'fr');
    assert.deepEqual(await api.fileStore.write(ref, setAsk('Continuer ?')), { ok: true });
    await changeOnDisk(fr, '"MINUTE": "Minute"', '"MINUTE": "Minuto"');
    const result = await api.fileStore.undo();
    assert.ok(result && !result.ok && result.reason === 'changed');
    assert.ok((await read(fr)).includes('"ASK": "Continuer ?"'));
  });

  test('creates the files of a new language, and undo removes them again', async () => {
    const es = uriOf('common', 'es');
    const result = await api.fileStore.write(ref, (analysis) =>
      planAddLanguage(analysis.bundles, analysis.area, 'es'),
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(await read(es), '{}\n');
    assert.deepEqual(await api.fileStore.undo(), { ok: true });
    assert.equal(await exists(es), false);
  });

  test('writes every file of a change or none', async () => {
    const files = ['de', 'en', 'fr'].map((locale) => uriOf('common', locale));
    const before = await Promise.all(files.map(read));
    // The last file of the change cannot be written: the first two must come back.
    chmodSync(files[2]!.fsPath, 0o444);
    try {
      const result = await api.fileStore.write(
        ref,
        edit('common', {
          kind: 'addKey',
          key: keyFromSegments(['NEW']),
          values: { de: 'Neu', en: 'New', fr: 'Nouveau' },
          after: id('SAVE'),
        }),
      );
      assert.ok(!result.ok && result.reason === 'error', JSON.stringify(result));
    } finally {
      chmodSync(files[2]!.fsPath, 0o644);
    }
    assert.deepEqual(await Promise.all(files.map(read)), before);
  });
});
