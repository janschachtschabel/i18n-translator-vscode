import * as assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { planEdit, type BundleEdit } from '../../src/core/edit/planEdit';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import type { BackupSettings } from '../../src/core/config/settings';
import { BackupService } from '../../src/extension/services/backupService';
import { FileStore, rootRef, type Planner, type RootRef } from '../../src/extension/services/fileStore';
import { activateExtension, workspaceUri } from './helpers';

const I18N = 'Frontend/src/assets/i18n';
const MINUTE = 60_000;
const id = (dotted: string) => keyFromSegments(dotted.split('.')).id;
const fr = () => workspaceUri(`${I18N}/common/fr.json`);

const edit =
  (change: BundleEdit): Planner =>
  (analysis) =>
    planEdit(
      analysis.bundles.find((bundle) => bundle.name === 'common')!,
      change,
    );
const setAsk = (value: string) => edit({ kind: 'setText', entryId: id('ASK'), locale: 'fr', value });

suite('Backups', () => {
  const log = vscode.window.createOutputChannel('edu-sharing i18n (backup tests)', { log: true });
  let api: ExtensionApi;
  let ref: RootRef;
  let original: [vscode.Uri, Uint8Array][];
  let storage: string;
  let settings: BackupSettings;
  let now: number;
  let backups: BackupService;
  let store: FileStore;
  const translationFiles = () => vscode.workspace.findFiles(`${I18N}/**/*.json`);

  suiteSetup(async () => {
    api = await activateExtension();
    ref = rootRef((api.index.current() ?? (await api.index.refresh())).roots[0]!);
    original = await Promise.all(
      (await translationFiles()).map(async (uri) => [uri, await vscode.workspace.fs.readFile(uri)] as const),
    ).then((files) => files.map(([uri, bytes]) => [uri, bytes]));
  });

  // A new session for every test: its own storage, settings, clock and store.
  setup(() => {
    storage = mkdtempSync(join(tmpdir(), 'edu-i18n-backups-'));
    settings = { keep: 10, intervalMinutes: 10 };
    now = Date.parse('2026-09-25T10:00:00Z');
    backups = new BackupService(
      vscode.Uri.file(storage),
      api.index,
      log,
      () => settings,
      () => now,
    );
    store = new FileStore(api.index, log, { beforeWrite: (kind, files) => backups.beforeWrite(kind, files) });
  });

  teardown(async () => {
    for (const [uri, bytes] of original) {
      await vscode.workspace.fs.writeFile(uri, bytes);
    }
    rmSync(storage, { recursive: true, force: true });
    await api.index.refresh();
  });

  suiteTeardown(() => log.dispose());

  test('backs up the state before the first write of a session, and not before every text', async () => {
    const before = await vscode.workspace.fs.readFile(fr());
    assert.deepEqual(await store.write(ref, setAsk('Continuer ?')), { ok: true });
    now += MINUTE;
    assert.deepEqual(await store.write(ref, setAsk('Continuer ?!')), { ok: true });
    const list = await backups.list();
    assert.deepEqual(
      list.map((backup) => [backup.reason, backup.files]),
      [['first-write', original.length]],
    );
    const saved = (await backups.read(list[0]!.id)).files.find(
      (file) => file.uri.toString() === fr().toString(),
    );
    assert.deepEqual(saved?.bytes, before);
  });

  test('backs up before a change of several files and after the interval', async () => {
    assert.deepEqual(await store.write(ref, setAsk('Continuer ?')), { ok: true });
    now += MINUTE;
    const addKey = edit({
      kind: 'addKey',
      key: keyFromSegments(['NEW']),
      values: { de: 'Neu', en: 'New', fr: 'Nouveau' },
      after: id('SAVE'),
    });
    assert.deepEqual(await store.write(ref, addKey), { ok: true });
    now += 10 * MINUTE;
    assert.deepEqual(await store.write(ref, setAsk('Continuer ?!')), { ok: true });
    assert.deepEqual(
      (await backups.list()).map((backup) => backup.reason),
      ['interval', 'several-files', 'first-write'],
    );
  });

  test('keeps only the newest backups', async () => {
    settings = { keep: 2, intervalMinutes: 10 };
    for (let count = 0; count < 4; count++) {
      await backups.create('manual');
      now += MINUTE;
    }
    const list = await backups.list();
    assert.equal(list.length, 2);
    assert.deepEqual(
      list.map((backup) => backup.created.toISOString()),
      ['2026-09-25T10:03:00.000Z', '2026-09-25T10:02:00.000Z'],
    );
    assert.equal(readdirSync(join(storage, 'backups')).length, 2);
  });

  test('keeps the order of backups made in the same millisecond', async () => {
    settings = { keep: 3, intervalMinutes: 10 };
    const made: string[] = [];
    for (let count = 0; count < 12; count++) {
      made.push((await backups.create('manual'))!.id);
    }
    assert.deepEqual(
      (await backups.list()).map((backup) => backup.id),
      made.slice(-3).reverse(),
    );
  });

  test('keeps the backup that is restored, even when it is the oldest', async () => {
    settings = { keep: 2, intervalMinutes: 10 };
    const oldest = await backups.create('manual');
    now += MINUTE;
    await backups.create('manual');
    now += MINUTE;
    assert.deepEqual(await store.restore((await backups.read(oldest!.id)).files), { ok: true });
    assert.ok((await backups.list()).some((backup) => backup.id === oldest!.id));
  });

  test('leaves out unfinished backups and removes them', async () => {
    const unfinished = join(storage, 'backups', '2026-09-25T09-00-00-000Z');
    mkdirSync(join(unfinished, '0'), { recursive: true });
    await backups.create('manual');
    assert.equal((await backups.list()).length, 1);
    assert.equal(existsSync(unfinished), false);
  });

  test('refuses manifests that would lead out of their folder', async () => {
    const backup = await backups.create('manual');
    const path = join(storage, 'backups', backup!.id, 'manifest.json');
    const original = readFileSync(path, 'utf8');
    const tamperings: [string, (manifest: { files: { folder: number; path: string }[] }) => void][] = [
      ['parent path', (manifest) => (manifest.files[0]!.path = '../outside.json')],
      ['backslash', (manifest) => (manifest.files[0]!.path = 'a\\b.json')],
      ['folder index', (manifest) => (manifest.files[0]!.folder = 5)],
    ];
    for (const [name, tamper] of tamperings) {
      const manifest = JSON.parse(original) as { files: { folder: number; path: string }[] };
      tamper(manifest);
      writeFileSync(path, JSON.stringify(manifest));
      assert.deepEqual(await backups.list(), [], name);
      assert.deepEqual((await backups.read(backup!.id)).files, [], name);
    }
  });

  test('restores the bytes of a backup through the file store, after backing up the current state', async () => {
    const before = await vscode.workspace.fs.readFile(fr());
    const manual = await backups.create('manual');
    now += MINUTE;
    assert.deepEqual(await store.write(ref, setAsk('Autre chose ?')), { ok: true });
    assert.deepEqual(await store.restore((await backups.read(manual!.id)).files), { ok: true });
    assert.deepEqual(await vscode.workspace.fs.readFile(fr()), before);
    assert.equal((await backups.list())[0]!.reason, 'restore');
    // A restore is one write: undo brings the state before it back.
    assert.deepEqual(await store.undo(), { ok: true });
    assert.ok(new TextDecoder().decode(await vscode.workspace.fs.readFile(fr())).includes('Autre chose ?'));
  });

  test('stops a restore, but not a write, when the backup fails', async () => {
    // Backups cannot be stored below a file.
    const blocked = join(storage, 'blocked');
    writeFileSync(blocked, 'not a folder');
    const failing = new BackupService(
      vscode.Uri.file(blocked),
      api.index,
      log,
      () => settings,
      () => now,
    );
    const failingStore = new FileStore(api.index, log, {
      beforeWrite: (kind, files) => failing.beforeWrite(kind, files),
    });
    const before = await vscode.workspace.fs.readFile(fr());
    assert.deepEqual(await failingStore.write(ref, setAsk('Continuer ?')), { ok: true });
    const result = await failingStore.restore([{ uri: fr(), bytes: before }]);
    assert.ok(!result.ok && result.reason === 'error', JSON.stringify(result));
    assert.ok(new TextDecoder().decode(await vscode.workspace.fs.readFile(fr())).includes('Continuer ?'));
  });
});
