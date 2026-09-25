import * as assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import * as vscode from 'vscode';
import { planAddLanguage, planEdit, type BundleEdit } from '../../src/core/edit/planEdit';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import { FileStore, type Planner } from '../../src/extension/services/fileStore';
import { rootRef, type RootRef } from '../../src/extension/services/workspaceIndex';
import { sameBytes } from '../../src/extension/services/files';
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
  const log = vscode.window.createOutputChannel('edu-sharing i18n (file store tests)', { log: true });
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

  suiteTeardown(() => log.dispose());

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
    assert.equal((await api.fileStore.undo())?.ok, true);
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
    assert.equal((await api.fileStore.undo())?.ok, true);
    assert.equal(await exists(es), false);
  });

  test('restores only files inside an indexed translation folder', async () => {
    const outside = workspaceUri('restored.json');
    const result = await api.fileStore.restore([{ uri: outside, bytes: encoder.encode('{}\n') }]);
    assert.ok(!result.ok && result.reason === 'error', JSON.stringify(result));
    assert.equal(await exists(outside), false);
  });

  test('refuses a plan that would write outside its root', async () => {
    const result = await api.fileStore.write(ref, () => ({
      ok: true,
      changes: [{ kind: 'create', relPath: 'outside.json', content: '{}\n' }],
    }));
    assert.ok(!result.ok && result.reason === 'error', JSON.stringify(result));
    assert.equal(await exists(workspaceUri('outside.json')), false);
  });

  test('gives up after planning three times on files that keep differing from the index', async () => {
    const de = uriOf('common', 'de');
    const before = await vscode.workspace.fs.readFile(de);
    let plans = 0;
    // A new file where one exists never matches the disk, however often the index is refreshed.
    const result = await api.fileStore.write(ref, () => {
      plans++;
      return { ok: true, changes: [{ kind: 'create', relPath: `${I18N}/common/de.json`, content: '{}\n' }] };
    });
    assert.ok(!result.ok && result.reason === 'changed', JSON.stringify(result));
    assert.equal(plans, 3);
    assert.deepEqual(await vscode.workspace.fs.readFile(de), before);
  });

  test('reports a root that is no longer indexed', async () => {
    const result = await api.fileStore.write({ ...ref, root: '' }, setAsk('Continuer ?'));
    assert.ok(!result.ok && result.reason === 'error');
    assert.equal(result.message, 'The translation folder . is no longer indexed.');
  });

  test('keeps an undo while its file has unsaved changes', async () => {
    const fr = uriOf('common', 'fr');
    const before = await vscode.workspace.fs.readFile(fr);
    assert.deepEqual(await api.fileStore.write(ref, setAsk('Continuer ?')), { ok: true });
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fr));
    await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), ' '));
    const refused = await api.fileStore.undo();
    assert.ok(refused && !refused.ok && refused.reason === 'dirty');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    assert.equal((await api.fileStore.undo())?.ok, true);
    assert.deepEqual(await vscode.workspace.fs.readFile(fr), before);
  });

  test('checks the files after the backup, so that a change during the backup is kept', async () => {
    const fr = uriOf('common', 'fr');
    const store = new FileStore(api.index, log, {
      beforeWrite: () => changeOnDisk(fr, '"MINUTE": "Minute"', '"MINUTE": "Minuto"'),
    });
    assert.deepEqual(await store.write(ref, setAsk('Continuer ?', 'Voulez-vous continuer ?')), { ok: true });
    const text = await read(fr);
    assert.ok(text.includes('"MINUTE": "Minuto"') && text.includes('"ASK": "Continuer ?"'), text);
  });

  test('runs exclusive tasks, such as a manual backup, between writes', async () => {
    const order: string[] = [];
    const write = api.fileStore.write(ref, (analysis) => {
      order.push('write');
      return setAsk('Continuer ?')(analysis);
    });
    const task = api.fileStore.exclusive(async () => {
      order.push('exclusive');
    });
    await Promise.all([write, task]);
    assert.deepEqual(order, ['write', 'exclusive']);
  });

  test('keeps an undo after a read error, for another try', async () => {
    let failReads = false;
    const store = new FileStore(api.index, log, {
      files: {
        readFile: (uri) =>
          failReads ? Promise.reject(new Error('busy')) : vscode.workspace.fs.readFile(uri),
        writeFile: (uri, bytes) => vscode.workspace.fs.writeFile(uri, bytes),
        delete: (uri) => vscode.workspace.fs.delete(uri),
      },
    });
    const fr = uriOf('common', 'fr');
    const before = await vscode.workspace.fs.readFile(fr);
    assert.deepEqual(await store.write(ref, setAsk('Continuer ?')), { ok: true });
    failReads = true;
    const failed = await store.undo();
    assert.ok(failed && !failed.ok && failed.reason === 'error', JSON.stringify(failed));
    failReads = false;
    assert.equal((await store.undo())?.ok, true);
    assert.deepEqual(await vscode.workspace.fs.readFile(fr), before);
  });

  test('keeps undo entries within a memory limit, but always the newest', async () => {
    const store = new FileStore(api.index, log, { limits: { undoEntries: 100, undoBytes: 1 } });
    assert.deepEqual(await store.write(ref, setAsk('Un')), { ok: true });
    assert.deepEqual(await store.write(ref, setAsk('Deux')), { ok: true });
    assert.equal((await store.undo())?.ok, true);
    assert.equal(await store.undo(), undefined);
    assert.ok((await read(uriOf('common', 'fr'))).includes('"ASK": "Un"'));
  });

  test('restores a file whose write failed half-way, as writeFile empties it first', async () => {
    const fr = uriOf('common', 'fr');
    const before = await vscode.workspace.fs.readFile(fr);
    const store = new FileStore(api.index, log, {
      files: {
        readFile: (uri) => vscode.workspace.fs.readFile(uri),
        writeFile: async (uri, bytes) => {
          if (uri.toString() === fr.toString() && !sameBytes(bytes, before)) {
            await vscode.workspace.fs.writeFile(uri, new Uint8Array());
            throw new Error('disk full');
          }
          await vscode.workspace.fs.writeFile(uri, bytes);
        },
        delete: (uri) => vscode.workspace.fs.delete(uri),
      },
    });
    const result = await store.write(ref, setAsk('Continuer ?'));
    assert.deepEqual(result, { ok: false, reason: 'error', message: 'disk full' });
    assert.deepEqual(await vscode.workspace.fs.readFile(fr), before);
  });

  test('names the files that could not be restored after a failed write', async () => {
    const fr = uriOf('common', 'fr');
    const store = new FileStore(api.index, log, {
      files: {
        readFile: (uri) => vscode.workspace.fs.readFile(uri),
        writeFile: async (uri, bytes) => {
          if (uri.toString() === fr.toString()) {
            throw new Error('disk full');
          }
          await vscode.workspace.fs.writeFile(uri, bytes);
        },
        delete: (uri) => vscode.workspace.fs.delete(uri),
      },
    });
    const result = await store.write(ref, setAsk('Continuer ?'));
    assert.ok(!result.ok && result.reason === 'error');
    assert.deepEqual(
      result.notRestored?.map((uri) => uri.toString()),
      [fr.toString()],
    );
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
