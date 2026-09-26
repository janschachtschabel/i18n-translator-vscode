import * as vscode from 'vscode';
import { isPlainRelativePath } from '../../core/area/rootPath';

export type BackupReason = 'first-write' | 'several-bundles' | 'interval' | 'manual' | 'restore';

const REASONS: readonly BackupReason[] = ['first-write', 'several-bundles', 'interval', 'manual', 'restore'];

/** The file of a backup folder that describes it. */
export const MANIFEST = 'manifest.json';

/** Written last into a backup folder; the files lie at `<folder index>/<path>` next to it. */
export interface Manifest {
  version: 1;
  created: string;
  reason: BackupReason;
  /** Workspace folder URIs; the `folder` of a file is an index into this list. */
  folders: string[];
  files: { folder: number; path: string }[];
}

/** Manifests are read from disk: every path must stay inside its folder. */
export function isManifest(value: unknown): value is Manifest {
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
export function folderUri(value: string): vscode.Uri | undefined {
  try {
    return vscode.Uri.parse(value, true);
  } catch {
    // A manifest from disk may hold anything; such a folder is skipped like one that is not open.
    return undefined;
  }
}
