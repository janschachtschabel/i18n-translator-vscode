import type { AreaDefinition } from '../area/areaDefinition';
import { compileFilePattern } from '../area/filePattern';
import { normalizeRoot } from '../area/rootPath';
import type { AreaId, LocaleCode } from '../model/types';

export interface DiscoveredFile {
  areaId: AreaId;
  /** Workspace-relative root folder the file was found under ('' = the workspace folder itself). */
  root: string;
  bundle: string;
  locale: LocaleCode;
  /** Workspace-relative path with `/` separators. */
  relPath: string;
}

export interface AreaWithRoots {
  area: AreaDefinition;
  roots: readonly string[];
}

/** Derives area roots from found marker files: `Frontend/src/assets/i18n/common/de.json` → `Frontend/src/assets/i18n`. */
export function rootsFromMarkers(markerPaths: readonly string[], markerPath: string): string[] {
  const marker = toPosix(markerPath);
  const roots = new Set<string>();
  for (const path of markerPaths.map(toPosix)) {
    if (path === marker) {
      roots.add('');
    } else if (path.endsWith(`/${marker}`)) {
      roots.add(path.slice(0, -marker.length - 1));
    }
  }
  return [...roots].sort();
}

/** Assigns area, bundle and locale to every path that lies below an area root and fits the area's pattern. */
export function classifyFiles(paths: readonly string[], areas: readonly AreaWithRoots[]): DiscoveredFile[] {
  const matchers = areas.map(({ area, roots }) => ({
    areaId: area.id,
    // Equivalent spellings collapse to one root; roots outside the workspace folder are skipped.
    roots: [...new Set(roots.map(normalizeRoot).filter((root) => root !== undefined))],
    match: compileFilePattern(area),
  }));
  const files: DiscoveredFile[] = [];
  for (const relPath of paths.map(toPosix)) {
    for (const { areaId, roots, match } of matchers) {
      for (const root of roots) {
        const inner = pathBelow(root, relPath);
        const hit = inner === null ? null : match(inner);
        if (hit) {
          files.push({ areaId, root, bundle: hit.bundle, locale: hit.locale, relPath });
        }
      }
    }
  }
  return files;
}

/** Path relative to `root`, or null if `path` does not lie below it. */
function pathBelow(root: string, path: string): string | null {
  if (root === '') {
    return path;
  }
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null;
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}
