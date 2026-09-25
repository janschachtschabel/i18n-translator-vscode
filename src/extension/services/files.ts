import * as vscode from 'vscode';
import type { FormatAdapter } from '../../core/formats/adapter';
import type { DecodedText } from '../../core/text/decode';

/** Bytes a file gets; undefined deletes it (e.g. when undoing a new file). */
export interface Put {
  uri: vscode.Uri;
  bytes: Uint8Array | undefined;
}

/** How files are read and written: `vscode.workspace.fs`, or a stand-in that fails on purpose in tests. */
export interface FileAccess {
  readFile(uri: vscode.Uri): Thenable<Uint8Array>;
  writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
  delete(uri: vscode.Uri): Thenable<void>;
}

export async function put(files: FileAccess, { uri, bytes }: Put): Promise<void> {
  if (bytes) {
    await files.writeFile(uri, bytes);
  } else {
    await files.delete(uri);
  }
}

/** Why {@link putAllOrNone} failed: the error, and the files that could not get their old bytes back. */
export interface PutFailure {
  error: unknown;
  notRestored: vscode.Uri[];
}

/**
 * Writes the files in order, all or none: if one fails, it and those written before it get their `restore`
 * bytes back (`writeFile` empties a file before it writes, so the failed one may be cut off). Undefined when
 * every file was written.
 */
export async function putAllOrNone(
  access: FileAccess,
  files: readonly Put[],
  restore: readonly Put[],
  log: vscode.LogOutputChannel,
): Promise<PutFailure | undefined> {
  for (const [position, file] of files.entries()) {
    try {
      await put(access, file);
    } catch (error) {
      log.error(`Could not write ${relative(file.uri)}; restoring the files written so far.`, error);
      const notRestored: vscode.Uri[] = [];
      for (const done of restore.slice(0, position + 1).reverse()) {
        try {
          await put(access, done);
        } catch (restoreError) {
          // Removing a new file that was never created is no failure.
          if (!(done.bytes === undefined && isFileNotFound(restoreError))) {
            log.error(`Could not restore ${relative(done.uri)}.`, restoreError);
            notRestored.push(done.uri);
          }
        }
      }
      return { error, notRestored };
    }
  }
  return undefined;
}

export function isFileNotFound(error: unknown): boolean {
  return error instanceof vscode.FileSystemError && error.code === 'FileNotFound';
}

/** Whether the bytes on disk still hold the text a change was planned on (no file, for a new one). */
export function holds(
  bytes: Uint8Array | undefined,
  planned: DecodedText | undefined,
  adapter: FormatAdapter,
): boolean {
  if (bytes === undefined || planned === undefined) {
    return bytes === undefined && planned === undefined;
  }
  const current = adapter.decode(bytes);
  return (
    current.text === planned.text && current.encoding === planned.encoding && current.bom === planned.bom
  );
}

/** The bytes of a file, or undefined if it does not exist; other errors are thrown. */
export async function readIfExists(
  uri: vscode.Uri,
  files: Pick<FileAccess, 'readFile'> = vscode.workspace.fs,
): Promise<Uint8Array | undefined> {
  try {
    return await files.readFile(uri);
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** Whether an editor holds unsaved changes of the file. */
export function isDirty(uri: vscode.Uri): boolean {
  const target = comparable(uri);
  return vscode.workspace.textDocuments.some(
    (document) => document.isDirty && comparable(document.uri) === target,
  );
}

/** The path of a file as messages and logs show it: relative to its workspace folder, named if several are open. */
export function relative(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri);
}

/** File systems on Windows and macOS ignore case, and an editor keeps the case a file was opened with. */
function comparable(uri: vscode.Uri): string {
  return process.platform === 'linux' ? uri.toString() : uri.toString().toLowerCase();
}
