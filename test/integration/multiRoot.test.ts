import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { planEdit } from '../../src/core/edit/planEdit';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import { BackupService } from '../../src/extension/services/backupService';
import { rootRef, type IndexedRoot } from '../../src/extension/services/workspaceIndex';
import { activateExtension } from './helpers';

const common = (root: IndexedRoot) => root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
const frOf = (root: IndexedRoot) => vscode.Uri.joinPath(root.folder.uri, common(root).file('fr')!.relPath);
const read = (uri: vscode.Uri) => vscode.workspace.fs.readFile(uri);

/**
 * The workspace of the profile "multi" (.vscode-test.mjs): two copies of the fixture, "first" and "second";
 * "nested", a folder inside "first" that holds its translation folder; and "data", the translation folder of a third
 * copy itself. Skipped in the other profiles (audit T-05).
 */
suite('multi-root workspace', () => {
  let api: ExtensionApi;

  suiteSetup(async function () {
    if ((vscode.workspace.workspaceFolders?.length ?? 0) < 2) {
      this.skip();
    }
    api = await activateExtension();
  });
  teardown(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  const roots = async () => (await api.index.refresh()).roots;
  const rootIn = (all: readonly IndexedRoot[], folder: string) =>
    all.find((root) => root.folder.name === folder)!;

  test('indexes each translation folder once, in the innermost workspace folder', async () => {
    assert.deepEqual((await roots()).map((root) => [root.folder.name, root.analysis.root]).sort(), [
      ['data', ''],
      ['nested', 'src/assets/i18n'],
      ['second', 'Frontend/src/assets/i18n'],
    ]);
  });

  // Many open the translation folder itself (…/assets/i18n) rather than the checkout: its root is the folder.
  test('reads and writes in a workspace folder that is the translation folder itself', async () => {
    const data = rootIn(await roots(), 'data');
    assert.equal(common(data).file('fr')!.relPath, 'common/fr.json');
    const fr = frOf(data);
    const before = await read(fr);
    try {
      const result = await api.fileStore.write(rootRef(data), (analysis) =>
        planEdit(
          analysis.bundles.find((bundle) => bundle.name === 'common')!,
          {
            kind: 'setText',
            entryId: keyFromSegments(['ASK']).id,
            locale: 'fr',
            value: 'Continuer ?',
          },
        ),
      );
      assert.deepEqual(result, { ok: true });
      assert.match(new TextDecoder().decode(await read(fr)), /"ASK": "Continuer \?"/);
    } finally {
      await vscode.workspace.fs.writeFile(fr, before);
      await api.index.refresh();
    }
  });

  test('writes into the folder of the edited root only', async () => {
    const all = await roots();
    const [nested, second] = [rootIn(all, 'nested'), rootIn(all, 'second')];
    const [nestedBefore, secondBefore] = await Promise.all([read(frOf(nested)), read(frOf(second))]);
    try {
      const result = await api.fileStore.write(rootRef(second), (analysis) =>
        planEdit(
          analysis.bundles.find((bundle) => bundle.name === 'common')!,
          {
            kind: 'setText',
            entryId: keyFromSegments(['ASK']).id,
            locale: 'fr',
            value: 'Continuer ?',
          },
        ),
      );
      assert.deepEqual(result, { ok: true });
      assert.deepEqual(await read(frOf(nested)), nestedBefore);
      assert.notDeepEqual(await read(frOf(second)), secondBefore);
    } finally {
      await vscode.workspace.fs.writeFile(frOf(second), secondBefore);
      await api.index.refresh();
    }
  });

  test('backs up the files of every folder, and restores each into its folder', async () => {
    const storage = mkdtempSync(join(tmpdir(), 'edu-i18n-multi-'));
    const log = vscode.window.createOutputChannel('edu-sharing i18n (multi-root tests)', { log: true });
    const files = (await roots()).map(frOf);
    const before = await Promise.all(files.map(read));
    try {
      const backups = new BackupService(vscode.Uri.file(storage), api.index, log, {
        settings: () => ({ keep: 10, intervalMinutes: 10 }),
      });
      const backup = await backups.create('manual');
      assert.ok(backup);
      for (const uri of files) {
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode('{}\n'));
      }
      assert.deepEqual(await api.fileStore.restore((await backups.read(backup.id)).files), { ok: true });
      assert.deepEqual(await Promise.all(files.map(read)), before);
    } finally {
      for (const [index, uri] of files.entries()) {
        await vscode.workspace.fs.writeFile(uri, before[index]!);
      }
      rmSync(storage, { recursive: true, force: true });
      log.dispose();
      await api.index.refresh();
    }
  });

  // Two installations had editors of the same name (audit L-13).
  test('names the workspace folder in the titles of the editors of the same bundle', async () => {
    const titles = (await roots()).map((root) => api.editors.open(root, common(root)).panel.title);
    assert.deepEqual(titles.sort(), ['common (data)', 'common (nested)', 'common (second)']);
  });
});
