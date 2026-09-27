import * as vscode from 'vscode';
import type { AreaDefinition } from '../../core/area/areaDefinition';
import type { Settings } from '../../core/config/settings';
import { rootsFromMarkers } from '../../core/discovery/discover';
import { filesToRead, type SourceFile } from '../../core/pipeline/analyze';
import { revisionOf } from '../../core/util/hash';
import { messageOf } from './errors';
import { isLinkType, linkedFolders, linkOnTheWay } from './links';
import { relativeUriPath } from './uriPaths';

/**
 * Bounds for what a repository holds, as it is read into the extension host: many roots, a root of many files or
 * a file of many megabytes would stall it. edu-sharing has one root of about 90 files, the largest 80 KB.
 */
export interface RootLimits {
  /** Roots an area may detect in a workspace folder; more must be set in `eduI18n.roots`. */
  roots: number;
  /** Files of any kind below a root. */
  files: number;
  /** Bytes of one translation file. */
  fileBytes: number;
  /**
   * Bytes of the translation files of a root together: each file below the limit is still read and parsed (audit
   * S-11). edu-sharing's largest root has 0.9 MB.
   */
  rootBytes: number;
}

export const ROOT_LIMITS: RootLimits = {
  roots: 20,
  files: 5000,
  fileBytes: 5 * 1024 * 1024,
  rootBytes: 10 * 1024 * 1024,
};

/** The roots of an area in a workspace folder, from its marker files: a search of the whole folder. */
export async function detectRoots(
  folder: vscode.WorkspaceFolder,
  area: AreaDefinition,
  exclude: string | null,
  limits = ROOT_LIMITS,
): Promise<string[]> {
  if (!area.detect) {
    return [];
  }
  const markers = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, area.detect.glob),
    exclude,
    limits.roots + 1,
  );
  // A marker file per root: beyond the limit, the search stops without them all.
  if (markers.length > limits.roots) {
    throw new Error(
      vscode.l10n.t('there are more than {count} roots; set the ones to check in eduI18n.roots', {
        count: limits.roots,
      }),
    );
  }
  return rootsFromMarkers(relativePaths(folder, markers), area.detect.marker);
}

/** The files below `root` that belong to the area. */
export async function listRoot(
  folder: vscode.WorkspaceFolder,
  area: AreaDefinition,
  root: string,
  exclude: string | null,
  limits = ROOT_LIMITS,
): Promise<string[]> {
  const pattern = new vscode.RelativePattern(vscode.Uri.joinPath(folder.uri, root), '**/*');
  const found = await vscode.workspace.findFiles(pattern, exclude, limits.files + 1);
  if (found.length > limits.files) {
    throw new Error(vscode.l10n.t('the folder holds more than {count} files', { count: limits.files }));
  }
  return filesToRead(area, root, relativePaths(folder, found));
}

/**
 * Unreadable files (e.g. deleted since the listing), files reached through a symbolic link, files beyond the size
 * limit and those beyond the budget of the root are reported and left out.
 */
export async function readFiles(
  folder: vscode.WorkspaceFolder,
  paths: readonly string[],
  report: (message: string) => void,
  limits = ROOT_LIMITS,
): Promise<SourceFile[]> {
  const linked = await linkedFolders(folder.uri, paths);
  const unreadable = (relPath: string, error: unknown) =>
    report(vscode.l10n.t('{file} could not be read: {error}', { file: relPath, error: messageOf(error) }));
  // One look at each file tells whether it is a link itself and how large it is.
  const looked = await Promise.all(
    paths.map(async (relPath) => {
      const uri = vscode.Uri.joinPath(folder.uri, relPath);
      try {
        return { relPath, uri, stat: await vscode.workspace.fs.stat(uri) };
      } catch (error) {
        unreadable(relPath, error);
        return undefined;
      }
    }),
  );
  // In the order given, so that the files a budget leaves out do not depend on which look answers first.
  let budget = limits.rootBytes;
  const chosen: { relPath: string; uri: vscode.Uri }[] = [];
  for (const file of looked) {
    if (!file) {
      continue;
    }
    const { relPath, stat } = file;
    const link = linkOnTheWay(relPath, linked) ?? (isLinkType(stat.type) ? relPath : undefined);
    if (link !== undefined) {
      report(
        vscode.l10n.t('{file} is reached through the symbolic link {link} and was not read.', {
          file: relPath,
          link,
        }),
      );
    } else if (stat.size > limits.fileBytes) {
      report(
        vscode.l10n.t('{file} is larger than {size} and was not read.', {
          file: relPath,
          size: kilobytes(limits.fileBytes),
        }),
      );
    } else if (stat.size > budget) {
      report(
        vscode.l10n.t('{file} was not read: the files of its folder are larger than {size} together.', {
          file: relPath,
          size: kilobytes(limits.rootBytes),
        }),
      );
    } else {
      budget -= stat.size;
      chosen.push(file);
    }
  }
  const files = await Promise.all(
    chosen.map(async ({ relPath, uri }) => {
      try {
        return { relPath, bytes: await vscode.workspace.fs.readFile(uri) };
      } catch (error) {
        unreadable(relPath, error);
        return undefined;
      }
    }),
  );
  return files.filter((file) => file !== undefined);
}

function kilobytes(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

/** The revision of each file by its path: whether a root still has the files it had when it was indexed. */
export function revisionsOf(files: readonly SourceFile[]): ReadonlyMap<string, string> {
  return new Map(files.map((file) => [file.relPath, revisionOf(file.bytes)]));
}

export function sameRevisions(
  a: ReadonlyMap<string, string> | undefined,
  b: ReadonlyMap<string, string>,
): boolean {
  return a !== undefined && a.size === b.size && [...b].every(([path, revision]) => a.get(path) === revision);
}

/** Workspace-relative paths of search results; results outside the folder cannot occur and are dropped. */
function relativePaths(folder: vscode.WorkspaceFolder, uris: readonly vscode.Uri[]): string[] {
  return uris.map((uri) => relativeUriPath(folder.uri.path, uri.path)).filter((path) => path !== undefined);
}

/** Roots from `eduI18n.roots` or the area definition; undefined means the roots are detected. */
export function fixedRoots(area: AreaDefinition, settings: Settings): readonly string[] | undefined {
  // Own keys only: an area id like "constructor" must not find Object.prototype.constructor.
  if (Object.hasOwn(settings.roots, area.id)) {
    return settings.roots[area.id];
  }
  return area.roots.length > 0 ? area.roots : undefined;
}
