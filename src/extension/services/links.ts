import * as vscode from 'vscode';
import { relativeUriPath } from './uriPaths';

// The extension neither reads nor writes through symbolic links: they can lead out of the workspace folder, where
// its checks of paths do not reach.

/**
 * The folders on the way from `folder` to each of `relPaths` that are symbolic links, as paths relative to it.
 * Every folder is looked at once, all at the same time: the files of a root share most of their folders.
 */
export async function linkedFolders(folder: vscode.Uri, relPaths: readonly string[]): Promise<Set<string>> {
  const folders = new Set(
    relPaths.flatMap((relPath) => {
      const segments = relPath.split('/');
      return segments.slice(1).map((_, index) => segments.slice(0, index + 1).join('/'));
    }),
  );
  const linked = await Promise.all(
    [...folders].map(async (path) => ((await isLink(folder, path)) ? path : undefined)),
  );
  return new Set(linked.filter((path) => path !== undefined));
}

/** The first of `linked` (from {@link linkedFolders}) on the way to `relPath`, if any. */
export function linkOnTheWay(relPath: string, linked: ReadonlySet<string>): string | undefined {
  const segments = relPath.split('/');
  for (let length = 1; length < segments.length; length++) {
    const path = segments.slice(0, length).join('/');
    if (linked.has(path)) {
      return path;
    }
  }
  return undefined;
}

/** Whether a type from a stat of a file says that the file itself is a symbolic link. */
export function isLinkType(type: vscode.FileType): boolean {
  return (type & vscode.FileType.SymbolicLink) !== 0;
}

/** The first of `uris` that is reached through a symbolic link inside its workspace folder, with that link. */
export async function firstLinked(
  uris: readonly vscode.Uri[],
): Promise<{ uri: vscode.Uri; link: string } | undefined> {
  for (const uri of uris) {
    const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri;
    const relPath = folder && relativeUriPath(folder.path, uri.path);
    // Files outside the workspace folders never get here: they lie outside the translation folders too.
    if (!folder || !relPath) {
      continue;
    }
    const link =
      linkOnTheWay(relPath, await linkedFolders(folder, [relPath])) ??
      ((await isLink(folder, relPath)) ? relPath : undefined);
    if (link !== undefined) {
      return { uri, link };
    }
  }
  return undefined;
}

/**
 * Whether the path below `folder` is a symbolic link. What cannot be looked at, e.g. what does not exist yet,
 * counts as none: reading or writing it then fails on its own, with its own message.
 */
async function isLink(folder: vscode.Uri, path: string): Promise<boolean> {
  try {
    return isLinkType((await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder, ...path.split('/')))).type);
  } catch {
    return false;
  }
}
