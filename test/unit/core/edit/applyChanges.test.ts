import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { applyChanges, type ApplyResult } from '../../../../src/core/edit/applyChanges';
import { planAddLanguage, planEdit, type BundleEdit } from '../../../../src/core/edit/planEdit';
import { jsonNestedAdapter } from '../../../../src/core/formats/json/jsonNested';
import type { Bundle } from '../../../../src/core/model/bundle';
import { keyFromSegments } from '../../../../src/core/model/keys';
import { analyzeFixtureWorkspace, analyzeTexts } from '../../support/fixtureWorkspace';

const { analysis } = analyzeFixtureWorkspace();
const id = (dotted: string) => keyFromSegments(dotted.split('.')).id;

/** Plans an edit of the only bundle and applies it, as the file store does. */
function planAndApply(bundle: Bundle, edit: BundleEdit): ApplyResult {
  const plan = planEdit(bundle, edit);
  if (!plan.ok) {
    throw new Error(`planning failed: ${plan.problem.code}`);
  }
  return applyChanges(plan.changes, [bundle], jsonNestedAdapter);
}

describe('applyChanges', () => {
  it('applies the planned operations to the text they were planned on', () => {
    const common = analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const result = planAndApply(common, {
      kind: 'setText',
      entryId: id('ASK'),
      locale: 'fr',
      value: 'Continuer ?',
    });
    expect(result.ok && result.writes.map((write) => write.relPath)).toEqual([common.file('fr')!.relPath]);
    if (result.ok) {
      expect(result.writes[0]!.before).toBe(common.file('fr')!.doc);
      expect(result.writes[0]!.after.text).toContain('"ASK": "Continuer ?"');
    }
  });

  it('turns created files into UTF-8 documents without a byte order mark', () => {
    const plan = planAddLanguage(analysis.bundles, ANGULAR_PRESET, 'es');
    const result = plan.ok ? applyChanges(plan.changes, analysis.bundles, jsonNestedAdapter) : undefined;
    expect(result?.ok && result.writes.map(({ before, after }) => [before, after])).toEqual(
      Array.from({ length: 4 }, () => [undefined, { text: '{}\n', encoding: 'utf-8', bom: false }]),
    );
  });

  it('explains other refusals of the writer with the problems of planning', () => {
    const common = analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const broken = analysis.bundles.find((bundle) => bundle.name === 'broken')!;
    const gone = keyFromSegments(['GONE']);
    const problemOf = (bundle: Bundle, relPath: string) => {
      const result = applyChanges(
        [{ kind: 'edit', relPath, ops: [{ kind: 'delete', key: gone }] }],
        [bundle],
        jsonNestedAdapter,
      );
      return result.ok ? 'ok' : [result.problem.code, result.problem.message.args];
    };
    expect(problemOf(common, common.file('fr')!.relPath)).toEqual([
      'missing-key',
      { key: 'GONE', bundle: 'common' },
    ]);
    const unreadable = broken.file('de')!.relPath;
    expect(problemOf(broken, unreadable)).toEqual(['unreadable-file', { file: unreadable }]);
    expect(() => problemOf(common, 'elsewhere/fr.json')).toThrow(RangeError);
  });

  it('explains what only the writer sees: a value that is not a text where the text goes', () => {
    const problemOf = (texts: Record<string, string>, entry: string) => {
      const [bundle] = analyzeTexts(texts).bundles;
      const result = planAndApply(bundle!, { kind: 'setText', entryId: id(entry), locale: 'fr', value: 'y' });
      return result.ok ? 'ok' : [result.problem.code, result.problem.message.args];
    };
    expect(problemOf({ 'x/de.json': '{"X": "x"}', 'x/fr.json': '{"X": {}}' }, 'X')).toEqual([
      'not-a-text',
      { key: 'X', file: 'i18n/x/fr.json' },
    ]);
    expect(problemOf({ 'n/de.json': '{"N": "n"}', 'n/fr.json': '{"N": 5}' }, 'N')).toEqual([
      'not-a-text',
      { key: 'N', file: 'i18n/n/fr.json' },
    ]);
    expect(problemOf({ 'p/de.json': '{"N": {"X": "x"}}', 'p/fr.json': '{"N": 5}' }, 'N.X')).toEqual([
      'path-conflict',
      { key: 'N.X', other: 'N' },
    ]);
  });
});
