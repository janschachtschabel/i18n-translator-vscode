import type { AreaDefinition } from '../area/areaDefinition';
import { ALL_RULES } from '../checks/rules';
import { runChecks } from '../checks/runChecks';
import type { Issue, SeverityOverrides } from '../checks/types';
import type { CompiledVariant } from '../checks/variants';
import { classifyFiles } from '../discovery/discover';
import { ADAPTERS } from '../formats/registry';
import { buildBundle, type Bundle, type BundleOptions, type LoadedFile } from '../model/bundle';
import type { LocaleCode } from '../model/types';

/** A file the host has read; the core never touches the file system itself. */
export interface SourceFile {
  /** Workspace-relative path. */
  relPath: string;
  bytes: Uint8Array;
}

export interface AnalysisOptions extends BundleOptions {
  variants: ReadonlyMap<LocaleCode, CompiledVariant>;
  severityOverrides: SeverityOverrides;
  ignoreSameAsReference: readonly string[];
}

export interface RootAnalysis {
  area: AreaDefinition;
  root: string;
  /** Sorted by name. */
  bundles: Bundle[];
  issues: Issue[];
  /** Problems of the area configuration, e.g. a file pattern that maps two files to one locale. */
  warnings: string[];
}

/** The paths below `root` that belong to the area: the only files a host needs to read for {@link analyzeRoot}. */
export function filesToRead(area: AreaDefinition, root: string, paths: readonly string[]): string[] {
  return classifyFiles(paths, [{ area, roots: [root] }]).map((file) => file.relPath);
}

/**
 * Parses the files below one area root, builds its bundles and runs the check catalog. Each root is
 * analyzed on its own: two roots are two independent installations and must not be merged.
 */
export function analyzeRoot(
  area: AreaDefinition,
  root: string,
  files: readonly SourceFile[],
  options: AnalysisOptions,
): RootAnalysis {
  const adapter = ADAPTERS[area.format];
  const byPath = new Map(files.map((file) => [file.relPath.replace(/\\/g, '/'), file]));
  const groups = new Map<string, LoadedFile[]>();
  const warnings: string[] = [];
  const found = classifyFiles([...byPath.keys()], [{ area, roots: [root] }]).sort((a, b) =>
    a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0,
  );
  for (const { bundle, locale, relPath } of found) {
    const group = groups.get(bundle) ?? [];
    const existing = group.find((file) => file.locale === locale);
    if (existing) {
      warnings.push(
        `${relPath} is ignored: ${existing.relPath} already provides ${locale} for "${bundle}" (check the file pattern of ${area.id}).`,
      );
      continue;
    }
    const doc = adapter.decode(byPath.get(relPath)!.bytes);
    group.push({ locale, relPath, doc, parsed: adapter.parse(doc) });
    groups.set(bundle, group);
  }

  const bundles = [...groups.keys()]
    .sort()
    .map((name) => buildBundle(area, root, name, groups.get(name)!, options));
  const issues = runChecks(
    { area, bundles, variants: options.variants, ignoreSameAsReference: options.ignoreSameAsReference },
    ALL_RULES,
    options.severityOverrides,
  );
  return { area, root, bundles, issues, warnings };
}
