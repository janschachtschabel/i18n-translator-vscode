import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { Issue } from '../../src/core/checks/types';
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

  // A git pull may delete a key everywhere while the index still has it: a text for it would bring the key back
  // as an orphan. The plan rests on every file of the bundle, not only on those it writes (audit L-11).
  test('plans again when another file of the bundle changed on disk since indexing', async () => {
    await changeOnDisk(uriOf('common', 'de'), '  "CANCEL": "Abbrechen",\n', '');
    await changeOnDisk(uriOf('common', 'en'), '  "CANCEL": "Cancel",\n', '');
    await changeOnDisk(uriOf('common', 'it'), '  "CANCEL": "Annulla",\n', '');
    const fr = uriOf('common', 'fr');
    const before = await read(fr);
    const result = await api.fileStore.write(
      ref,
      edit('common', { kind: 'setText', entryId: id('CANCEL'), locale: 'fr', value: 'Annuler' }),
    );
    assert.ok(
      !result.ok && result.reason === 'problem' && result.problem.code === 'missing-key',
      JSON.stringify(result),
    );
    assert.equal(await read(fr), before);
  });

  test('undoes the last write byte for byte', async () => {
    const fr = uriOf('common', 'fr');
    const before = await vscode.workspace.fs.readFile(fr);
    assert.deepEqual(await api.fileStore.write(ref, setAsk('Continuer ?')), { ok: true });
    assert.equal((await api.fileStore.undo())?.ok, true);
    assert.deepEqual(await vscode.workspace.fs.readFile(fr), before);
  });

  // An editor asks before it undoes a change of another bundle (audit S-07).
  test('offers the files of an undo to `accept` first, and keeps the undo when it declines', async () => {
    const fr = uriOf('common', 'fr');
    const before = await vscode.workspace.fs.readFile(fr);
    assert.deepEqual(await api.fileStore.write(ref, setAsk('Continuer ?')), { ok: true });
    const offered: string[][] = [];
    const answer = (accepted: boolean) => async (files: readonly vscode.Uri[]) => {
      offered.push(files.map((file) => file.toString()));
      return accepted;
    };
    assert.deepEqual(await api.fileStore.undo(answer(false)), { ok: false, reason: 'declined' });
    assert.ok((await read(fr)).includes('"ASK": "Continuer ?"'));
    assert.equal((await api.fileStore.undo(answer(true)))?.ok, true);
    assert.deepEqual(await vscode.workspace.fs.readFile(fr), before);
    assert.deepEqual(offered, [[fr.toString()], [fr.toString()]]);
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

  // A run of the index, e.g. one a watcher started, that read a file while it is written would publish it half
  // written; CI once saw two index changes for one write (audit L-04).
  test('keeps runs of the index from reading a file while it is written', async () => {
    const missingInFr = (snapshot: { roots: readonly { analysis: { issues: readonly Issue[] } }[] }) =>
      snapshot.roots[0]!.analysis.issues.filter(
        (issue) => issue.rule === 'missing-key' && issue.locale === 'fr',
      ).length;
    const expected = missingInFr(await api.index.refresh());
    const seen: number[] = [];
    const listener = api.index.onDidChange((snapshot) => seen.push(missingInFr(snapshot)));
    const runs: Promise<unknown>[] = [];
    const store = new FileStore(api.index, log, {
      files: {
        readFile: (uri) => vscode.workspace.fs.readFile(uri),
        delete: (uri) => vscode.workspace.fs.delete(uri),
        writeFile: async (uri, bytes) => {
          // As a file passes through when it is written in place: first without its text, then with it.
          await vscode.workspace.fs.writeFile(uri, new Uint8Array());
          const run = api.index.refreshRoot(ref);
          runs.push(run);
          await Promise.race([run, new Promise((resolve) => setTimeout(resolve, 300))]);
          await vscode.workspace.fs.writeFile(uri, bytes);
        },
      },
    });
    try {
      assert.deepEqual(await store.write(ref, setAsk('Continuer ?')), { ok: true });
      await Promise.all(runs);
      await store.indexed();
      assert.deepEqual(seen, [expected]);
    } finally {
      listener.dispose();
    }
  });

  // VS Code's test runner always trusts the workspace; the store is told it is not (audit T-03, S-07).
  test('writes, restores and undoes nothing in Restricted Mode, and keeps the undo', async () => {
    let trusted = true;
    const store = new FileStore(api.index, log, { trusted: () => trusted });
    const fr = uriOf('common', 'fr');
    assert.deepEqual(await store.write(ref, setAsk('Continuer ?')), { ok: true });
    const written = await read(fr);
    trusted = false;
    assert.equal(store.canWrite(), false);
    assert.deepEqual(await store.write(ref, setAsk('Autre ?')), { ok: false, reason: 'untrusted' });
    assert.deepEqual(await store.restore([{ uri: fr, bytes: encoder.encode('{}\n') }]), {
      ok: false,
      reason: 'untrusted',
    });
    assert.deepEqual(await store.undo(async () => assert.fail('asked in Restricted Mode')), {
      ok: false,
      reason: 'untrusted',
    });
    assert.equal(await read(fr), written);
    trusted = true;
    assert.equal((await store.undo())?.ok, true);
  });

  // The first backup of a session takes a few hundred milliseconds: time enough to type into the file (audit L-02).
  for (const kind of ['write', 'restore'] as const) {
    test(`checks for unsaved changes after the backup of a ${kind}, so that an editor's changes are kept`, async () => {
      const fr = uriOf('common', 'fr');
      const before = await read(fr);
      const store = new FileStore(api.index, log, {
        beforeWrite: async () => {
          const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fr));
          await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), ' '));
        },
      });
      const result =
        kind === 'write'
          ? await store.write(ref, setAsk('Continuer ?'))
          : await store.restore([{ uri: fr, bytes: encoder.encode('{}\n') }]);
      assert.ok(!result.ok && result.reason === 'dirty', JSON.stringify(result));
      assert.equal(await read(fr), before);
    });
  }

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
            // As a write that runs out of space: the file is cut off, and so is every try to restore it.
            await vscode.workspace.fs.writeFile(uri, new Uint8Array());
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

  // A read-only or locked file refuses the write before it changes: it is not damaged (audit L-10).
  test('does not report a file as damaged that a failed write left as it was', async () => {
    const fr = uriOf('common', 'fr');
    const before = await vscode.workspace.fs.readFile(fr);
    const store = new FileStore(api.index, log, {
      files: {
        readFile: (uri) => vscode.workspace.fs.readFile(uri),
        writeFile: async (uri, bytes) => {
          if (uri.toString() === fr.toString()) {
            throw new Error('access denied');
          }
          await vscode.workspace.fs.writeFile(uri, bytes);
        },
        delete: (uri) => vscode.workspace.fs.delete(uri),
      },
    });
    const result = await store.write(ref, setAsk('Continuer ?'));
    assert.deepEqual(result, { ok: false, reason: 'error', message: 'access denied' });
    assert.deepEqual(await vscode.workspace.fs.readFile(fr), before);
  });

  test('writes every file of a change or none', async () => {
    const files = ['de', 'en', 'fr'].map((locale) => uriOf('common', locale));
    const before = await Promise.all(files.map(read));
    // The last file of the change cannot be written (e.g. read-only): the first two must come back. A failing
    // write stands in for it, as file permissions do not stop root (audit T-10).
    const store = new FileStore(api.index, log, {
      files: {
        readFile: (uri) => vscode.workspace.fs.readFile(uri),
        delete: (uri) => vscode.workspace.fs.delete(uri),
        writeFile: (uri, bytes) =>
          uri.toString() === files[2]!.toString()
            ? Promise.reject(vscode.FileSystemError.NoPermissions(uri))
            : vscode.workspace.fs.writeFile(uri, bytes),
      },
    });
    const result = await store.write(
      ref,
      edit('common', {
        kind: 'addKey',
        key: keyFromSegments(['NEW']),
        values: { de: 'Neu', en: 'New', fr: 'Nouveau' },
        after: id('SAVE'),
      }),
    );
    assert.ok(!result.ok && result.reason === 'error' && !result.notRestored, JSON.stringify(result));
    assert.deepEqual(await Promise.all(files.map(read)), before);
  });
});
