import * as vscode from 'vscode';
import type { BackupSettings } from '../../core/config/settings';
import { readBackupSettings } from '../config';
import { messageOf } from './errors';
import type { RestoredFile } from './fileStore';
import { readIfExists } from './files';
import { isPlainRelativePath } from './uriPaths';
import type { IndexSnapshot, WorkspaceIndex } from './workspaceIndex';
import { showWarning } from '../notify';

export type BackupReason = 'first-write' | 'several-bundles' | 'interval' | 'manual' | 'restore';

export interface BackupInfo {
  /** Folder name below `backups/`; sorts by creation time. */
  id: string;
  created: Date;
  reason: BackupReason;
  files: number;
}

/** Written last into a backup folder; the files lie at `<folder index>/<path>` next to it. */
interface Manifest {
  version: 1;
  created: string;
  reason: BackupReason;
  /** Workspace folder URIs; the `folder` of a file is an index into this list. */
  folders: string[];
  files: { folder: number; path: string }[];
}

const MANIFEST = 'manifest.json';
const REASONS: readonly BackupReason[] = ['first-write', 'several-bundles', 'interval', 'manual', 'restore'];
/**
 * An ISO timestamp with `-` for `:` and `.`, plus a three-digit counter for backups in the same millisecond,
 * so that ids sort in the order they were made.
 */
const ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d{3})?$/;

/**
 * Copies every indexed translation file into the extension's storage for this workspace, never into the
 * repository: before the first write of a session, before writes of several bundles, at the next write once
 * `intervalMinutes` have passed, before a restore, and on request. Keeps the newest `keep` backups.
 */
export class BackupService {
  /** Time of the last backup in this session; undefined until the first. */
  private lastBackup: number | undefined;
  /** The backup read last for restoring: removing old backups must not delete it (it may be the oldest). */
  private restoring: string | undefined;

  constructor(
    /** `context.storageUri`: undefined without a workspace, and then nothing is backed up. */
    private readonly storage: vscode.Uri | undefined,
    private readonly index: WorkspaceIndex,
    private readonly log: vscode.LogOutputChannel,
    // Invalid values fall back to the defaults; the index reports them.
    private readonly settings: () => BackupSettings = () => readBackupSettings().settings,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * For the file store, before it writes. A failed backup is reported but does not stop a change; before a
   * restore, it throws, and the restore does not happen.
   */
  async beforeWrite(kind: 'write' | 'restore', bundles: number): Promise<void> {
    const reason = this.reasonFor(kind, bundles);
    if (!reason) {
      return;
    }
    try {
      await this.create(reason);
    } catch (error) {
      // A restore replaces files wholesale, so it stops; a change can go ahead, since it can be undone.
      if (kind === 'restore') {
        throw error;
      }
      this.log.error('Backing up the translation files failed.', error);
      void showWarning(
        vscode.l10n.t('The translation files could not be backed up: {error}', { error: messageOf(error) }),
      );
    }
  }

  /** Backs up every indexed translation file. Undefined when there is nothing to back up or no storage. */
  async create(reason: BackupReason): Promise<BackupInfo | undefined> {
    const sources = translationFiles(await this.index.latest());
    if (!this.storage || sources.length === 0) {
      return undefined;
    }
    const created = this.now();
    const id = await this.freeId(created);
    const base = vscode.Uri.joinPath(this.storage, 'backups', id);
    const folders = [...new Set(sources.map((source) => source.folder.toString()))];
    // A file that cannot be read is left out: one locked file must not prevent every backup.
    const read = await Promise.allSettled(
      sources.map(({ folder, path }) => readIfExists(vscode.Uri.joinPath(folder, ...path.split('/')))),
    );
    const copies = sources.flatMap(({ folder, path }, i) => {
      const result = read[i]!;
      if (result.status === 'rejected') {
        this.log.warn(`Backup ${id}: ${path} could not be read and is left out.`, result.reason);
        return [];
      }
      return result.value ? [{ folder: folders.indexOf(folder.toString()), path, bytes: result.value }] : [];
    });
    const files = copies.map(({ folder, path }) => ({ folder, path }));
    const manifest: Manifest = {
      version: 1,
      created: new Date(created).toISOString(),
      reason,
      folders,
      files,
    };
    try {
      await Promise.all(
        copies.map(({ folder, path, bytes }) =>
          vscode.workspace.fs.writeFile(vscode.Uri.joinPath(base, String(folder), ...path.split('/')), bytes),
        ),
      );
      // Written last: a folder without a manifest is an unfinished backup.
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(base, MANIFEST),
        new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
      );
    } catch (error) {
      await this.remove(id).catch((cleanupError: unknown) =>
        this.log.warn(`Backup ${id}: the unfinished backup could not be removed.`, cleanupError),
      );
      throw error;
    }
    this.lastBackup = created;
    this.log.info(`Backed up ${files.length} translation files (${reason}) to ${base.fsPath}`);
    // The backup is complete: removing old ones is housekeeping, which must not fail it (or the restore after it).
    await this.prune(id).catch((error: unknown) => this.log.warn('Old backups could not be removed.', error));
    return { id, created: new Date(created), reason, files: files.length };
  }

  /** The complete backups, newest first. */
  async list(): Promise<BackupInfo[]> {
    const ids = await this.ids();
    const infos = await Promise.all(
      ids.map(async (id) => {
        // One unreadable backup must not hide the others.
        const manifest = await this.manifest(id).catch((error: unknown) => {
          this.log.warn(`Backup ${id}: its manifest could not be read.`, error);
          return undefined;
        });
        return (
          manifest && {
            id,
            created: new Date(manifest.created),
            reason: manifest.reason,
            files: manifest.files.length,
          }
        );
      }),
    );
    return infos.filter((info) => info !== undefined).reverse();
  }

  /**
   * The files of a backup at their places in the workspace, for restoring it; that backup is then kept when
   * old backups are removed. Files of folders that are not open, or missing from the backup, are skipped.
   */
  async read(id: string): Promise<{ files: RestoredFile[]; skipped: number }> {
    const manifest = await this.manifest(id);
    if (!manifest || !this.storage) {
      return { files: [], skipped: 0 };
    }
    this.restoring = id;
    const base = vscode.Uri.joinPath(this.storage, 'backups', id);
    const files: RestoredFile[] = [];
    for (const file of manifest.files) {
      const folder = parseUri(manifest.folders[file.folder]!);
      const bytes = await readIfExists(
        vscode.Uri.joinPath(base, String(file.folder), ...file.path.split('/')),
      );
      if (!folder || !vscode.workspace.getWorkspaceFolder(folder) || !bytes) {
        this.log.warn(`Backup ${id}: ${file.path} is skipped (folder not open, or file missing).`);
        continue;
      }
      files.push({ uri: vscode.Uri.joinPath(folder, ...file.path.split('/')), bytes });
    }
    return { files, skipped: manifest.files.length - files.length };
  }

  private reasonFor(kind: 'write' | 'restore', bundles: number): BackupReason | undefined {
    if (kind === 'restore') {
      return 'restore';
    }
    if (this.lastBackup === undefined) {
      return 'first-write';
    }
    if (bundles > 1) {
      return 'several-bundles';
    }
    const { intervalMinutes } = this.settings();
    return intervalMinutes > 0 && this.now() - this.lastBackup >= intervalMinutes * 60_000
      ? 'interval'
      : undefined;
  }

  /** Backup folders, complete or not, oldest first. */
  private async ids(): Promise<string[]> {
    if (!this.storage) {
      return [];
    }
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(this.storage, 'backups'));
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        return [];
      }
      throw error;
    }
    return entries
      .filter(([name, type]) => type === vscode.FileType.Directory && ID.test(name))
      .map(([name]) => name)
      .sort();
  }

  /** The id of a new backup: after every backup of the same millisecond, so that it sorts last. */
  private async freeId(created: number): Promise<string> {
    const stamp = new Date(created).toISOString().replace(/[:.]/g, '-');
    const counters = (await this.ids())
      .filter((id) => id.startsWith(stamp))
      .map((id) => (id === stamp ? 1 : Number(id.slice(stamp.length + 1))));
    const next = counters.length === 0 ? 1 : Math.max(...counters) + 1;
    return next === 1 ? stamp : `${stamp}-${String(next).padStart(3, '0')}`;
  }

  /**
   * Keeps the newest `keep` complete backups, plus the one just made and the one being restored (which may be
   * the oldest, or older after a clock change). Folders without a manifest file were left by an interrupted
   * backup; backups run one at a time in the file store's queue, so none is being written now, and they go. A
   * manifest this version does not understand (from another version) is left alone.
   */
  private async prune(made: string): Promise<void> {
    const kept = new Set([made, this.restoring]);
    const complete: string[] = [];
    for (const id of await this.ids()) {
      try {
        if (await this.manifest(id)) {
          complete.push(id);
        } else if (!kept.has(id) && !(await readIfExists(this.manifestUri(id)))) {
          await this.remove(id);
        }
      } catch (error) {
        // A folder that cannot be read or removed stays; the next backup tries again.
        this.log.warn(`Backup ${id} could not be checked or removed.`, error);
      }
    }
    let excess = complete.length - this.settings().keep;
    for (const id of complete) {
      if (excess <= 0) {
        break;
      }
      if (!kept.has(id)) {
        try {
          await this.remove(id);
          excess--;
        } catch (error) {
          this.log.warn(`Backup ${id} could not be removed.`, error);
        }
      }
    }
  }

  private manifestUri(id: string): vscode.Uri {
    return vscode.Uri.joinPath(this.storage!, 'backups', id, MANIFEST);
  }

  private async remove(id: string): Promise<void> {
    await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.storage!, 'backups', id), {
      recursive: true,
      useTrash: false,
    });
  }

  /** The manifest of a complete, well-formed backup; the folder of an interrupted backup has none. */
  private async manifest(id: string): Promise<Manifest | undefined> {
    if (!this.storage || !ID.test(id)) {
      return undefined;
    }
    const bytes = await readIfExists(this.manifestUri(id));
    if (!bytes) {
      return undefined;
    }
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (isManifest(value)) {
        return value;
      }
    } catch (error) {
      this.log.warn(`Backup ${id}: the manifest is not valid JSON (${messageOf(error)}).`);
      return undefined;
    }
    this.log.warn(`Backup ${id}: the manifest does not have the expected form.`);
    return undefined;
  }
}

/** Every file of every indexed bundle, once, with its workspace folder. */
function translationFiles(snapshot: IndexSnapshot): { folder: vscode.Uri; path: string }[] {
  const files = new Map<string, { folder: vscode.Uri; path: string }>();
  for (const { folder, analysis } of snapshot.roots) {
    for (const bundle of analysis.bundles) {
      for (const locale of bundle.locales) {
        const path = bundle.file(locale)!.relPath;
        files.set(`${folder.uri.toString()} ${path}`, { folder: folder.uri, path });
      }
    }
  }
  return [...files.values()];
}

/** Manifests are read from disk: every path must stay inside its folder. */
function isManifest(value: unknown): value is Manifest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const manifest = value as Partial<Manifest>;
  const folders = manifest.folders;
  return (
    manifest.version === 1 &&
    typeof manifest.created === 'string' &&
    !Number.isNaN(Date.parse(manifest.created)) &&
    REASONS.includes(manifest.reason as BackupReason) &&
    Array.isArray(folders) &&
    folders.every((folder) => typeof folder === 'string') &&
    Array.isArray(manifest.files) &&
    manifest.files.every(
      (file) =>
        typeof file === 'object' &&
        file !== null &&
        Number.isInteger(file.folder) &&
        file.folder >= 0 &&
        file.folder < folders.length &&
        typeof file.path === 'string' &&
        isPlainRelativePath(file.path),
    )
  );
}

/** A folder URI from a manifest, or undefined if it does not parse. */
function parseUri(value: string): vscode.Uri | undefined {
  try {
    return vscode.Uri.parse(value, true);
  } catch {
    // A manifest from disk may hold anything; such a folder is skipped like one that is not open.
    return undefined;
  }
}
