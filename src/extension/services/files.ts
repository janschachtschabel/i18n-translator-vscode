import * as vscode from 'vscode';
import type { FormatAdapter } from '../../core/formats/adapter';
import type { DecodedText } from '../../core/text/decode';

/** Bytes a file gets; undefined deletes it (e.g. when undoing a new file). */
export interface Put {
  uri: vscode.Uri;
  bytes: Uint8Array | undefined;
}

export async function put({ uri, bytes }: Put): Promise<void> {
  if (bytes) {
    await vscode.workspace.fs.writeFile(uri, bytes);
  } else {
    await vscode.workspace.fs.delete(uri);
  }
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
export async function readIfExists(uri: vscode.Uri): Promise<Uint8Array | undefined> {
  try {
    return await vscode.workspace.fs.readFile(uri);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
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

/** The path of a file as messages and logs show it: relative to its workspace folder. */
export function relative(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false);
}

/** File systems on Windows and macOS ignore case, and an editor keeps the case a file was opened with. */
function comparable(uri: vscode.Uri): string {
  return process.platform === 'linux' ? uri.toString() : uri.toString().toLowerCase();
}
