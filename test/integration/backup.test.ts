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
import { planAddLanguage, planEdit, type BundleEdit } from '../../src/core/edit/planEdit';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import type { BackupSettings } from '../../src/core/config/settings';
import { BackupService, type BackupFiles } from '../../src/extension/services/backupService';
import { FileStore, type Planner } from '../../src/extension/services/fileStore';
import { rootRef, type RootRef } from '../../src/extension/services/workspaceIndex';
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
    backups = new BackupService(vscode.Uri.file(storage), api.index, log, {
      settings: () => settings,
      now: () => now,
    });
    store = new FileStore(api.index, log, { beforeWrite: (kind, files) => backups.beforeWrite(kind, files) });
  });

  teardown(async () => {
    const known = new Set(original.map(([uri]) => uri.toString()));
    for (const uri of await translationFiles()) {
      if (!known.has(uri.toString())) {
        await vscode.workspace.fs.delete(uri);
      }
    }
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

  test('backs up before a change of several bundles and after the interval, not for one bundle', async () => {
    assert.deepEqual(await store.write(ref, setAsk('Continuer ?')), { ok: true });
    now += MINUTE;
    // Three files of one bundle: the session undo covers it.
    const addKey = edit({
      kind: 'addKey',
      key: keyFromSegments(['NEW']),
      values: { de: 'Neu', en: 'New', fr: 'Nouveau' },
      after: id('SAVE'),
    });
    assert.deepEqual(await store.write(ref, addKey), { ok: true });
    now += MINUTE;
    const addLanguage: Planner = (analysis) => planAddLanguage(analysis.bundles, analysis.area, 'es');
    assert.deepEqual(await store.write(ref, addLanguage), { ok: true });
    now += 10 * MINUTE;
    assert.deepEqual(await store.write(ref, setAsk('Continuer ?!')), { ok: true });
    assert.deepEqual(
      (await backups.list()).map((backup) => backup.reason),
      ['interval', 'several-bundles', 'first-write'],
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

  // Removing old backups is housekeeping: its failure must fail neither the backup nor a restore (audit L-03).
  test('backs up and lists the others when an old backup cannot be read', async () => {
    const broken = join(storage, 'backups', '2026-09-25T08-00-00-000Z');
    mkdirSync(join(broken, 'manifest.json'), { recursive: true });
    const backup = await backups.create('manual');
    assert.ok(backup);
    assert.deepEqual(
      (await backups.list()).map((info) => info.id),
      [backup.id],
    );
    // It is not taken for an unfinished backup: it stays for someone to look at.
    assert.ok(existsSync(broken));
  });

  /** A backup service of this session whose file access fails where `fail` says so. */
  const failing = (fail: { read?: (uri: vscode.Uri) => boolean; remove?: (uri: vscode.Uri) => boolean }) => {
    const refused = (uri: vscode.Uri) => Promise.reject(vscode.FileSystemError.NoPermissions(uri));
    const files: BackupFiles = {
      readFile: (uri) => (fail.read?.(uri) ? refused(uri) : vscode.workspace.fs.readFile(uri)),
      writeFile: (uri, bytes) => vscode.workspace.fs.writeFile(uri, bytes),
      readDirectory: (uri) => vscode.workspace.fs.readDirectory(uri),
      delete: (uri, options) =>
        fail.remove?.(uri) ? refused(uri) : vscode.workspace.fs.delete(uri, options),
    };
    return new BackupService(vscode.Uri.file(storage), api.index, log, {
      settings: () => settings,
      now: () => now,
      files,
    });
  };

  // Failures of the storage while backing up, which the tests above cannot bring about (audit T-07).
  test('keeps backing up when old backups cannot be removed', async () => {
    settings = { keep: 1, intervalMinutes: 10 };
    const service = failing({ remove: () => true });
    for (let count = 0; count < 3; count++) {
      assert.ok(await service.create('manual'));
      now += MINUTE;
    }
    assert.equal((await service.list()).length, 3);
  });

  test('lists the other backups when the manifest of one cannot be read', async () => {
    const first = await backups.create('manual');
    now += MINUTE;
    const second = await backups.create('manual');
    const service = failing({ read: (uri) => uri.path.includes(first!.id) });
    assert.deepEqual(
      (await service.list()).map((info) => info.id),
      [second!.id],
    );
  });

  test('leaves out a translation file that cannot be read, and backs up the others', async () => {
    const service = failing({ read: (uri) => uri.toString() === fr().toString() });
    const backup = await service.create('manual');
    assert.equal(backup?.files, original.length - 1);
    const saved = (await service.read(backup!.id)).files.map((file) => file.uri.toString());
    assert.equal(saved.length, original.length - 1);
    assert.ok(!saved.includes(fr().toString()));
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
    // A manifest this version does not understand may come from another version: it is not removed.
    await backups.create('manual');
    assert.ok(existsSync(join(storage, 'backups', backup!.id)));
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
    assert.equal((await store.undo())?.ok, true);
    assert.ok(new TextDecoder().decode(await vscode.workspace.fs.readFile(fr())).includes('Autre chose ?'));
  });

  test('stops a restore, but not a write, when the backup fails', async () => {
    // Backups cannot be stored below a file.
    const blocked = join(storage, 'blocked');
    writeFileSync(blocked, 'not a folder');
    const failing = new BackupService(vscode.Uri.file(blocked), api.index, log, {
      settings: () => settings,
      now: () => now,
    });
    const failingStore = new FileStore(api.index, log, {
      beforeWrite: (kind, files) => failing.beforeWrite(kind, files),
    });
    const before = await vscode.workspace.fs.readFile(fr());
    assert.deepEqual(await failingStore.write(ref, setAsk('Continuer ?')), { ok: true });
    const result = await failingStore.restore([{ uri: fr(), bytes: before }]);
    assert.ok(!result.ok && result.reason === 'error', JSON.stringify(result));
    assert.ok(new TextDecoder().decode(await vscode.workspace.fs.readFile(fr())).includes('Continuer ?'));
  });

  // A backup that keeps failing read every file and warned again on every save (audit L-12).
  test('tries a failed backup again after the interval, not on every save', async () => {
    const blocked = join(storage, 'blocked');
    writeFileSync(blocked, 'not a folder');
    const failing = new BackupService(vscode.Uri.file(blocked), api.index, log, {
      settings: () => settings,
      now: () => now,
    });
    let attempts = 0;
    const create = failing.create.bind(failing);
    failing.create = (reason) => {
      attempts++;
      return create(reason);
    };
    const failingStore = new FileStore(api.index, log, {
      beforeWrite: (kind, files) => failing.beforeWrite(kind, files),
    });
    assert.deepEqual(await failingStore.write(ref, setAsk('Continuer ?')), { ok: true });
    assert.deepEqual(await failingStore.write(ref, setAsk('Continuez ?')), { ok: true });
    assert.equal(attempts, 1);
    now += settings.intervalMinutes * MINUTE;
    assert.deepEqual(await failingStore.write(ref, setAsk('Continuons ?')), { ok: true });
    assert.equal(attempts, 2);
  });
});
