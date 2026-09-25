import * as vscode from 'vscode';

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
