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
  for (const found of classifyFiles([...byPath.keys()], [{ area, roots: [root] }])) {
    const doc = adapter.decode(byPath.get(found.relPath)!.bytes);
    const group = groups.get(found.bundle) ?? [];
    group.push({ locale: found.locale, relPath: found.relPath, doc, parsed: adapter.parse(doc) });
    groups.set(found.bundle, group);
  }

  const bundles = [...groups.keys()]
    .sort()
    .map((name) => buildBundle(area, name, groups.get(name)!, options));
  const issues = runChecks(
    { area, bundles, variants: options.variants, ignoreSameAsReference: options.ignoreSameAsReference },
    ALL_RULES,
    options.severityOverrides,
  );
  return { area, root, bundles, issues };
}
