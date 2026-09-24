import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ANGULAR_PRESET } from '../../../src/core/area/presets';
import { compileVariants, DEFAULT_VARIANTS } from '../../../src/core/checks/variants';
import { rootsFromMarkers } from '../../../src/core/discovery/discover';
import {
  analyzeRoot,
  type AnalysisOptions,
  type RootAnalysis,
  type SourceFile,
} from '../../../src/core/pipeline/analyze';

const workspace = join(__dirname, '..', '..', 'fixtures', 'workspace-basic');

/** The edu-sharing defaults, as the extension uses them. */
const OPTIONS: AnalysisOptions = {
  referenceLanguage: 'de',
  baseFileLanguage: 'en',
  variants: compileVariants(DEFAULT_VARIANTS).variants,
  severityOverrides: {},
  ignoreSameAsReference: ['OK', 'E-Mail', 'CC-0', 'ID'],
};

/** Every file of test/fixtures/workspace-basic with its workspace-relative path. */
export function readFixtureWorkspace(): SourceFile[] {
  return readdirSync(workspace, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return { relPath: relative(workspace, path).replace(/\\/g, '/'), bytes: readFileSync(path) };
    });
}

/** The fixture workspace analyzed with the edu-sharing defaults, as the extension does. */
export function analyzeFixtureWorkspace(): { roots: string[]; analysis: RootAnalysis } {
  const files = readFixtureWorkspace();
  const roots = rootsFromMarkers(
    files.map((file) => file.relPath),
    ANGULAR_PRESET.detect!.marker,
  );
  const analysis = analyzeRoot(ANGULAR_PRESET, roots[0]!, files, OPTIONS);
  return { roots, analysis };
}

/**
 * Translation files given as texts (`bundle/locale.json` → content), analyzed like the fixture workspace below
 * the root `i18n`. For cases the fixture workspace does not show.
 */
export function analyzeTexts(texts: Readonly<Record<string, string>>): RootAnalysis {
  const files = Object.entries(texts).map(([path, text]) => ({
    relPath: `i18n/${path}`,
    bytes: new TextEncoder().encode(text),
  }));
  return analyzeRoot(ANGULAR_PRESET, 'i18n', files, OPTIONS);
}
