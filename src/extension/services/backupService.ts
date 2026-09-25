import * as vscode from 'vscode';
import type { BackupSettings } from '../../core/config/settings';
import { readBackupSettings } from '../config';
import { messageOf } from './errors';
import type { RestoredFile } from './fileStore';
import { readIfExists } from './files';
import { isPlainRelativePath } from './uriPaths';
import type { IndexSnapshot, WorkspaceIndex } from './workspaceIndex';

export type BackupReason = 'first-write' | 'several-files' | 'interval' | 'manual' | 'restore';

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
const REASONS: readonly BackupReason[] = ['first-write', 'several-files', 'interval', 'manual', 'restore'];
/** An ISO timestamp with `-` for `:` and `.`, plus a counter for backups in the same millisecond. */
const ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d+)?$/;

/**
 * Copies every indexed translation file into the extension's storage for this workspace, never into the
 * repository: before the first write of a session, before writes of several files, at the next write once
 * `intervalMinutes` have passed, before a restore, and on request. Keeps the newest `keep` backups.
 */
export class BackupService {
  /** Time of the last backup in this session; undefined until the first. */
  private lastBackup: number | undefined;

  constructor(
    /** `context.storageUri`: undefined without a workspace, and then nothing is backed up. */
    private readonly storage: vscode.Uri | undefined,
    private readonly index: WorkspaceIndex,
    private readonly log: vscode.LogOutputChannel,
    // Invalid values fall back to the defaults; the index reports them.
    private readonly settings: () => BackupSettings = () => readBackupSettings().settings,
    private readonly now: () => number = Date.now,
  ) {}

  /** For the file store, before it writes. A failed backup is reported but does not stop the write. */
  async beforeWrite(kind: 'write' | 'restore', files: number): Promise<void> {
    const reason = this.reasonFor(kind, files);
    if (!reason) {
      return;
    }
    try {
      await this.create(reason);
    } catch (error) {
      this.log.error('Backing up the translation files failed.', error);
      void vscode.window.showWarningMessage(
        vscode.l10n.t('The translation files could not be backed up: {error}', { error: messageOf(error) }),
      );
    }
  }

  /** Backs up every indexed translation file. Undefined when there is nothing to back up or no storage. */
  async create(reason: BackupReason): Promise<BackupInfo | undefined> {
    const sources = translationFiles(this.index.current() ?? (await this.index.refresh()));
    if (!this.storage || sources.length === 0) {
      return undefined;
    }
    const created = this.now();
    const id = await this.freeId(created);
    const base = vscode.Uri.joinPath(this.storage, 'backups', id);
    const folders = [...new Set(sources.map((source) => source.folder.toString()))];
    const copied = await Promise.all(
      sources.map(async ({ folder, path }) => {
        const bytes = await readIfExists(vscode.Uri.joinPath(folder, ...path.split('/')));
        if (!bytes) {
          return undefined;
        }
        const entry = { folder: folders.indexOf(folder.toString()), path };
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(base, String(entry.folder), ...path.split('/')),
          bytes,
        );
        return entry;
      }),
    );
    const files = copied.filter((entry) => entry !== undefined);
    const manifest: Manifest = {
      version: 1,
      created: new Date(created).toISOString(),
      reason,
      folders,
      files,
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(base, MANIFEST),
      new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
    );
    this.lastBackup = created;
    this.log.info(`Backed up ${files.length} translation files (${reason}) to ${base.fsPath}`);
    await this.prune();
    return { id, created: new Date(created), reason, files: files.length };
  }

  /** The complete backups, newest first. */
  async list(): Promise<BackupInfo[]> {
    const ids = await this.ids();
    const infos = await Promise.all(
      ids.map(async (id) => {
        const manifest = await this.manifest(id);
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

  /** The files of a backup at their places in the workspace; files of folders that are no longer open stay out. */
  async read(id: string): Promise<RestoredFile[]> {
    const manifest = await this.manifest(id);
    if (!manifest || !this.storage) {
      return [];
    }
    const base = vscode.Uri.joinPath(this.storage, 'backups', id);
    const restored: RestoredFile[] = [];
    for (const file of manifest.files) {
      const folder = vscode.Uri.parse(manifest.folders[file.folder]!);
      if (!vscode.workspace.getWorkspaceFolder(folder)) {
        this.log.warn(`Backup ${id}: ${folder.toString()} is not open; ${file.path} is not restored.`);
        continue;
      }
      restored.push({
        uri: vscode.Uri.joinPath(folder, ...file.path.split('/')),
        bytes: await vscode.workspace.fs.readFile(
          vscode.Uri.joinPath(base, String(file.folder), ...file.path.split('/')),
        ),
      });
    }
    return restored;
  }

  private reasonFor(kind: 'write' | 'restore', files: number): BackupReason | undefined {
    if (kind === 'restore') {
      return 'restore';
    }
    if (this.lastBackup === undefined) {
      return 'first-write';
    }
    if (files > 1) {
      return 'several-files';
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

  private async freeId(created: number): Promise<string> {
    const stamp = new Date(created).toISOString().replace(/[:.]/g, '-');
    const taken = new Set(await this.ids());
    let id = stamp;
    for (let count = 2; taken.has(id); count++) {
      id = `${stamp}-${count}`;
    }
    return id;
  }

  private async prune(): Promise<void> {
    const ids = await this.ids();
    for (const id of ids.slice(0, Math.max(0, ids.length - this.settings().keep))) {
      await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.storage!, 'backups', id), {
        recursive: true,
        useTrash: false,
      });
    }
  }

  /** The manifest of a complete, well-formed backup; the folder of an interrupted backup has none. */
  private async manifest(id: string): Promise<Manifest | undefined> {
    if (!this.storage || !ID.test(id)) {
      return undefined;
    }
    const bytes = await readIfExists(vscode.Uri.joinPath(this.storage, 'backups', id, MANIFEST));
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
