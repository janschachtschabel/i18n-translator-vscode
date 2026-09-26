import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { ISSUE_MESSAGES, MISSING_KEYS_MESSAGE } from '../../../../src/core/checks/messages';
import { compileVariants, DEFAULT_VARIANTS } from '../../../../src/core/checks/variants';
import { analyzeRoot } from '../../../../src/core/pipeline/analyze';
import { toProblems, type Problem } from '../../../../src/core/report/problems';
import { analyzeFixtureWorkspace } from '../../support/fixtureWorkspace';

const ROOT = 'Frontend/src/assets/i18n';
const { analysis } = analyzeFixtureWorkspace();

function inFile(problems: Problem[], file: string): Problem[] {
  return problems.filter((problem) => problem.location.relPath === `${ROOT}/${file}`);
}

describe('toProblems', () => {
  const problems = toProblems(analysis, 'aggregate');

  it('lists errors and warnings only (test/fixtures/README.md: 17 diagnostics)', () => {
    expect(problems).toHaveLength(17);
    expect(problems.some((problem) => problem.rule === 'same-as-reference')).toBe(false);
  });

  it('gives common/fr.json its four problems, with the lines of the affected keys', () => {
    expect(
      inFile(problems, 'common/fr.json').map((problem) => [problem.rule, problem.location.start.line]),
    ).toEqual([
      ['missing-key', 0],
      ['placeholder-mismatch', 1],
      ['empty-value', 4],
      ['html-mismatch', 7],
    ]);
  });

  it('combines the missing keys of one file into one problem that lists them', () => {
    const [missing] = inFile(problems, 'common/fr.json');
    expect(missing?.message).toEqual({ template: MISSING_KEYS_MESSAGE, args: { count: 2, locale: 'fr' } });
    expect(missing?.location).toEqual({
      relPath: `${ROOT}/common/fr.json`,
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    });
    expect(
      missing?.related.map(({ location, label }) => [location.relPath, location.start.line, label]),
    ).toEqual([
      [`${ROOT}/common/de.json`, 5, 'CANCEL: Abbrechen'],
      [`${ROOT}/common/de.json`, 18, 'WORKSPACE.FILE.TITLE: Datei'],
    ]);
  });

  it('keeps a single missing key as a problem of its own', () => {
    const [missing] = inFile(problems, 'common/it.json').filter((problem) => problem.rule === 'missing-key');
    expect(missing?.message).toEqual({
      template: ISSUE_MESSAGES['missing-key'],
      args: { key: 'WORKSPACE.FILE.TITLE', locale: 'it' },
    });
  });

  it('links a translation problem to the reference text', () => {
    const mismatch = problems.find((problem) => problem.rule === 'placeholder-mismatch');
    expect(mismatch?.related.map(({ location, label }) => [location.relPath, location.start, label])).toEqual(
      [[`${ROOT}/common/de.json`, { line: 1, character: 17 }, 'de: Fehler ({{date}})']],
    );
  });

  it('does not link problems that already point at the reference text', () => {
    const needed = problems.filter((problem) => problem.rule === 'variant-needed');
    expect(needed.map((problem) => [problem.location.relPath, problem.related])).toEqual([
      [`${ROOT}/admin/de.json`, []],
      [`${ROOT}/common/de.json`, []],
    ]);
  });

  it('attaches a missing file to the reference file of its bundle', () => {
    expect(
      problems
        .filter((problem) => problem.rule === 'missing-file')
        .map((problem) => [problem.location.relPath, problem.location.start.line]),
    ).toEqual([
      [`${ROOT}/admin/de.json`, 0],
      [`${ROOT}/admin/de.json`, 0],
      [`${ROOT}/editorial/de.json`, 0],
      [`${ROOT}/editorial/de.json`, 0],
    ]);
  });

  it('reports each missing key on its own in mode "individual" and none in mode "off"', () => {
    const count = (mode: 'individual' | 'off') =>
      toProblems(analysis, mode).filter((problem) => problem.rule === 'missing-key').length;
    expect(count('individual')).toBe(3);
    expect(count('off')).toBe(0);
  });

  it('shortens long reference texts', () => {
    const text = `${'x'.repeat(120)} {{p}}`;
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const root = analyzeRoot(
      ANGULAR_PRESET,
      'i18n',
      [
        { relPath: 'i18n/common/de.json', bytes: encode({ A: text }) },
        { relPath: 'i18n/common/fr.json', bytes: encode({ A: 'y' }) },
      ],
      {
        referenceLanguage: 'de',
        baseFileLanguage: 'en',
        variants: compileVariants(DEFAULT_VARIANTS).variants,
        severityOverrides: {},
        ignoreSameAsReference: [],
      },
    );
    const [mismatch] = toProblems(root, 'aggregate');
    expect(mismatch?.related[0]?.label).toBe(`de: ${'x'.repeat(79)}…`);
  });
});
