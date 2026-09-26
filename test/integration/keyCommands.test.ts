import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import { addKey } from '../../src/extension/commands/addKey';
import { addLanguage } from '../../src/extension/commands/addLanguage';
import { bundleTarget, rootTarget, type KeyCommandContext } from '../../src/extension/commands/commandTarget';
import { deleteKey } from '../../src/extension/commands/deleteKey';
import { runEditorCommand } from '../../src/extension/commands/keyCommands';
import type { Prompts } from '../../src/extension/commands/prompts';
import { FileStore } from '../../src/extension/services/fileStore';
import { renameKey } from '../../src/extension/commands/renameKey';
import type { ExtensionApi } from '../../src/extension/extension';
import { sameBytes } from '../../src/extension/services/files';
import type { IndexedRoot } from '../../src/extension/services/workspaceIndex';
import { activateExtension, answering, keepTranslationFiles } from './helpers';

const id = (dotted: string) => keyFromSegments(dotted.split('.')).id;
const decoder = new TextDecoder();

suite('key and language commands', () => {
  let api: ExtensionApi;
  let root: IndexedRoot;
  let restoreFiles: () => Promise<void>;

  suiteSetup(async () => {
    api = await activateExtension();
    restoreFiles = await keepTranslationFiles();
  });
  setup(async () => {
    root = (await api.index.refresh()).roots[0]!;
  });
  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await restoreFiles();
  });

  const context = (prompts: Prompts): KeyCommandContext => ({
    index: api.index,
    fileStore: api.fileStore,
    prompts,
  });
  const bundle = (name: string) => ({
    root,
    bundle: root.analysis.bundles.find((candidate) => candidate.name === name)!,
  });
  const uri = (path: string) => vscode.Uri.joinPath(root.folder.uri, root.analysis.root, path);
  const read = async (path: string) => decoder.decode(await vscode.workspace.fs.readFile(uri(path)));
  /** The bytes of every file of the root, to show that nothing was written. */
  const snapshot = () =>
    Promise.all(
      root.analysis.bundles.flatMap((candidate) =>
        candidate.locales.map((locale) =>
          vscode.workspace.fs.readFile(vscode.Uri.joinPath(root.folder.uri, candidate.file(locale)!.relPath)),
        ),
      ),
    );
  const unchanged = async (before: readonly Uint8Array[]) =>
    assert.ok((await snapshot()).every((bytes, index) => sameBytes(bytes, before[index]!)));

  test('adds a language: an empty file in each of the four bundles, which undo removes again', async () => {
    await addLanguage(context(answering('es')), root);
    const created = ['admin', 'broken', 'common', 'editorial'].map((name) => `${name}/es.json`);
    for (const path of created) {
      assert.strictEqual(await read(path), '{}\n', path);
    }
    assert.equal((await api.fileStore.undo())?.ok, true);
    for (const path of created) {
      await assert.rejects(Promise.resolve(vscode.workspace.fs.stat(uri(path))), path);
    }
  });

  test('renames a key in every bundle that has it, or only in this one, as the user chooses', async () => {
    const before = await snapshot();
    const all = answering('QUESTION', 1);
    await renameKey(context(all), bundle('common'), id('ASK'));
    assert.deepStrictEqual(all.asked[1], 'Rename ASK only in common, or in every bundle that has it?');
    for (const path of ['common/de.json', 'common/en.json', 'admin/de.json', 'admin/en.json']) {
      const text = await read(path);
      assert.ok(text.includes('"QUESTION"') && !text.includes('"ASK"'), path);
    }
    assert.equal((await api.fileStore.undo())?.ok, true);
    await unchanged(before);

    await renameKey(context(answering('QUESTION', 0)), bundle('common'), id('ASK'));
    assert.ok((await read('common/de.json')).includes('"QUESTION"'));
    assert.ok((await read('admin/de.json')).includes('"ASK"'));
    assert.equal((await api.fileStore.undo())?.ok, true);
    await unchanged(before);
  });

  test('writes nothing when the user cancels, at any question', async () => {
    const before = await snapshot();
    await renameKey(context(answering()), bundle('common'), id('ASK'));
    await renameKey(context(answering('QUESTION')), bundle('common'), id('ASK'));
    await deleteKey(context(answering()), bundle('common'), id('ASK'));
    await deleteKey(context(answering(false)), bundle('common'), id('MINUTE'));
    await addKey(context(answering('NEW_KEY')), bundle('common'));
    await addKey(context(answering('ADMIN.NOTE', false)), bundle('editorial'));
    await addLanguage(context(answering()), root);
    await unchanged(before);
  });

  test('adds a key with its reference text after the key it starts from', async () => {
    const before = await snapshot();
    await addKey(context(answering('NEW_KEY', 'Neu')), bundle('common'), id('SAVE'));
    const lines = (await read('common/de.json')).split('\n');
    const save = lines.findIndex((line) => line.includes('"SAVE"'));
    assert.strictEqual(lines[save + 1], '  "NEW_KEY": "Neu",');
    assert.ok(!(await read('common/fr.json')).includes('NEW_KEY'));
    assert.equal((await api.fileStore.undo())?.ok, true);
    await unchanged(before);
  });

  test('asks before adding a key whose top-level key another bundle has, which would replace it', async () => {
    const prompts = answering('ADMIN.NOTE', true, 'Notiz');
    await addKey(context(prompts), bundle('editorial'));
    assert.match(prompts.asked[1]!, /^ADMIN also exists in admin\./);
    assert.ok((await read('editorial/de.json')).includes('"NOTE": "Notiz"'));
    assert.equal((await api.fileStore.undo())?.ok, true);
  });

  test('deletes a key in all its languages after asking', async () => {
    const before = await snapshot();
    await deleteKey(context(answering(true)), bundle('common'), id('MINUTE'));
    for (const path of ['common/de.json', 'common/en.json', 'common/fr.json']) {
      assert.ok(!(await read(path)).includes('"MINUTE"'), path);
    }
    assert.equal((await api.fileStore.undo())?.ok, true);
    await unchanged(before);
  });

  test('acts on the node, the editor in front and the key its context menu names, or a picked bundle', async () => {
    const sources = { ...context(answering('common')), editors: api.editors };
    const node = { kind: 'bundle', root, bundle: bundle('common').bundle };
    assert.strictEqual((await bundleTarget(node, sources))?.target.bundle.name, 'common');
    assert.strictEqual(
      (await rootTarget({ kind: 'root', root }, sources))?.analysis.root,
      root.analysis.root,
    );
    // No editor in front: the user picks one.
    assert.strictEqual((await bundleTarget(undefined, sources))?.target.bundle.name, 'common');

    api.editors.open(root, bundle('admin').bundle);
    const menu = { webview: 'eduI18n.editor', webviewSection: 'key', entryId: id('ASK') };
    const found = await bundleTarget(menu, sources);
    assert.deepStrictEqual([found?.target.bundle.name, found?.entryId], ['admin', id('ASK')]);
    // What a webview puts on its elements is never a node, even when it looks like one.
    const forged = { ...menu, kind: 'bundle', root, bundle: bundle('common').bundle };
    assert.strictEqual((await bundleTarget(forged, sources))?.target.bundle.name, 'admin');
    // A key the bundle does not have counts as none: the argument comes from the webview.
    const unknown = await bundleTarget({ ...menu, entryId: id('SAVE') }, sources);
    assert.deepStrictEqual([unknown?.target.bundle.name, unknown?.entryId], ['admin', undefined]);
  });

  test('asks nothing in Restricted Mode, before any question', async () => {
    const before = await snapshot();
    const log = vscode.window.createOutputChannel('edu-sharing i18n (untrusted)', { log: true });
    const untrusted = new FileStore(api.index, log, { trusted: () => false });
    const panel = { folder: root.folder.uri.toString(), bundleId: bundle('common').bundle.id };
    try {
      for (const command of ['addKey', 'renameKey', 'deleteKey', 'addLanguage'] as const) {
        const prompts = answering('NEW_KEY', 'es', true);
        await runEditorCommand({ ...context(prompts), fileStore: untrusted }, command, panel, id('MINUTE'));
        assert.deepEqual(prompts.asked, [], command);
      }
      await unchanged(before);
    } finally {
      log.dispose();
    }
  });

  test('runs what an editor asks for on its bundle, and nothing for a key the bundle does not have', async () => {
    const before = await snapshot();
    const panel = { folder: root.folder.uri.toString(), bundleId: bundle('common').bundle.id };
    await runEditorCommand(context(answering(true)), 'deleteKey', panel, id('EDITORIAL.TITLE'));
    await unchanged(before);
    await runEditorCommand(context(answering(true)), 'deleteKey', panel, id('MINUTE'));
    assert.ok(!(await read('common/de.json')).includes('"MINUTE"'));
    assert.equal((await api.fileStore.undo())?.ok, true);
    await unchanged(before);
  });
});
