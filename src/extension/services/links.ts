import * as vscode from 'vscode';
import { isFileNotFound } from './files';
import { relativeUriPath } from './uriPaths';

/**
 * The first symbolic link on the way from `folder` down to `relPath`, the file included, as a path relative to
 * `folder`; undefined if there is none. The extension neither reads nor writes through links: they can lead out
 * of the workspace folder, where its checks of paths do not reach. `checked` keeps the folders found free of
 * links, so that the files of one folder check it once.
 */
export async function linkOnPath(
  folder: vscode.Uri,
  relPath: string,
  checked = new Set<string>(),
): Promise<string | undefined> {
  const segments = relPath.split('/');
  for (let length = 1; length <= segments.length; length++) {
    const path = segments.slice(0, length).join('/');
    if (checked.has(path)) {
      continue;
    }
    let type: vscode.FileType;
    try {
      type = (await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder, ...segments.slice(0, length)))).type;
    } catch (error) {
      // What does not exist yet, a new file or folder, is no link.
      if (isFileNotFound(error)) {
        return undefined;
      }
      throw error;
    }
    if (type & vscode.FileType.SymbolicLink) {
      return path;
    }
    if (length < segments.length) {
      checked.add(path);
    }
  }
  return undefined;
}

/** The first of `uris` that is reached through a symbolic link inside its workspace folder, with that link. */
export async function firstLinked(
  uris: readonly vscode.Uri[],
): Promise<{ uri: vscode.Uri; link: string } | undefined> {
  for (const uri of uris) {
    const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri;
    const relPath = folder && relativeUriPath(folder.path, uri.path);
    // Files outside the workspace folders never get here: they lie outside the translation folders too.
    const link = folder && relPath ? await linkOnPath(folder, relPath) : undefined;
    if (link !== undefined) {
      return { uri, link };
    }
  }
  return undefined;
}
