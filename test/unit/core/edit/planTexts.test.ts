import { describe, expect, it } from 'vitest';
import type { AreaDefinition } from '../../../../src/core/area/areaDefinition';
import { ANGULAR_PRESET, MAIL_PRESET, MDS_PRESET } from '../../../../src/core/area/presets';
import { applyChanges } from '../../../../src/core/edit/applyChanges';
import { planTexts, type TextItem } from '../../../../src/core/edit/planTexts';
import { ADAPTERS } from '../../../../src/core/formats/registry';
import { keyFromSegments } from '../../../../src/core/model/keys';
import { analyzeTexts } from '../../support/fixtureWorkspace';

const id = (...segments: string[]) => keyFromSegments(segments).id;

/** Plans `items` for `locale`, applies the plan in memory and reads the files again. */
function fill(
  texts: Record<string, string>,
  locale: string,
  items: TextItem[],
  area: AreaDefinition = ANGULAR_PRESET,
) {
  const analysis = analyzeTexts(texts, area);
  const bundle = analysis.bundles[0]!;
  const plan = planTexts(bundle, locale, items);
  const applied = applyChanges(plan.changes, analysis.bundles, ADAPTERS[bundle.format]);
  if (!applied.ok) {
    throw new Error(applied.problem.code);
  }
  const after = { ...texts };
  for (const write of applied.writes) {
    after[write.relPath.replace(/^i18n\//, '')] = write.after.text;
  }
  const again = analyzeTexts(after, area).bundles[0]!;
  return { plan, after, bundle: again };
}

describe('planTexts', () => {
  it('puts neighbouring missing texts in the order of the reference, in one change of the file', () => {
    const { plan, after } = fill(
      {
        'common/de.json': '{\n  "A": "a",\n  "B": "b",\n  "C": "c",\n  "D": "d"\n}\n',
        'common/fr.json': '{\n  "A": "a fr",\n  "D": "d fr"\n}\n',
      },
      'fr',
      [
        { entryId: id('C'), value: 'c fr', before: null },
        { entryId: id('B'), value: 'b fr', before: null },
      ],
    );
    expect(after['common/fr.json']).toBe(
      '{\n  "A": "a fr",\n  "B": "b fr",\n  "C": "c fr",\n  "D": "d fr"\n}\n',
    );
    expect(plan.changes).toHaveLength(1);
    expect(plan.planned).toEqual([id('B'), id('C')]);
    expect(plan.skipped).toEqual([]);
  });

  it('creates a missing object once for all its texts, and fills an empty text', () => {
    const { after, bundle } = fill(
      {
        'common/de.json': '{\n  "A": "a",\n  "OBJ": {\n    "X": "x",\n    "Y": "y"\n  },\n  "Z": "z"\n}\n',
        'common/fr.json': '{\n  "A": "a fr",\n  "Z": ""\n}\n',
      },
      'fr',
      [
        { entryId: id('OBJ', 'Y'), value: 'y fr', before: null },
        { entryId: id('Z'), value: 'z fr', before: '' },
        { entryId: id('OBJ', 'X'), value: 'x fr', before: null },
      ],
    );
    const parsed = JSON.parse(after['common/fr.json']!) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['A', 'OBJ', 'Z']);
    expect(parsed['OBJ']).toEqual({ X: 'x fr', Y: 'y fr' });
    expect(bundle.value(id('Z'), 'fr')).toBe('z fr');
  });

  it('writes the texts of an empty metadataset file after its guard line, in order', () => {
    const GUARD = 'this_is_a_bug_the_first_line_will_not_be_translated: guard\n';
    const { after } = fill(
      { 'mds_de_DE.properties': `${GUARD}a: A\nb: B\n`, 'mds_fr_FR.properties': GUARD },
      'fr_FR',
      [
        { entryId: id('b'), value: 'B fr', before: null },
        { entryId: id('a'), value: 'A fr', before: null },
      ],
      MDS_PRESET,
    );
    expect(after['mds_fr_FR.properties']).toBe(`${GUARD}a: A fr\nb: B fr\n`);
  });

  it('fills both fields of a template the language lacks, and a field of one it has', () => {
    const { bundle, after } = fill(
      {
        'templates_de_DE.xml':
          '<templates><template name="a"><subject>A</subject><message>MA</message></template>' +
          '<template name="b"><subject>B</subject><message>MB</message></template></templates>',
        'templates_fr_FR.xml': '<templates><template name="a"><subject>A fr</subject></template></templates>',
      },
      'fr_FR',
      [
        { entryId: id('b', 'message'), value: 'MB fr', before: null },
        { entryId: id('a', 'message'), value: 'MA fr', before: null },
        { entryId: id('b', 'subject'), value: 'B fr', before: null },
      ],
      MAIL_PRESET,
    );
    expect(bundle.value(id('a', 'message'), 'fr_FR')).toBe('MA fr');
    expect(bundle.value(id('b', 'subject'), 'fr_FR')).toBe('B fr');
    expect(bundle.value(id('b', 'message'), 'fr_FR')).toBe('MB fr');
    const text = after['templates_fr_FR.xml']!;
    expect(text.indexOf('B fr')).toBeLessThan(text.indexOf('MB fr'));
  });

  it('skips a text that changed meantime, one the file cannot hold, an empty one and an unknown key; plans the rest', () => {
    const analysis = analyzeTexts(
      {
        'templates_de_DE.xml':
          '<templates><template name="a"><subject>A</subject><message>MA</message></template></templates>',
        'templates_fr_FR.xml': '<templates><template name="a"><subject>A fr</subject></template></templates>',
      },
      MAIL_PRESET,
    );
    const plan = planTexts(analysis.bundles[0]!, 'fr_FR', [
      { entryId: id('a', 'subject'), value: 'A neu', before: 'A old' },
      { entryId: id('a', 'message'), value: `M${String.fromCharCode(11)}`, before: null },
      { entryId: id('a', 'subject'), value: '  ', before: 'A fr' },
      { entryId: id('gone', 'subject'), value: 'x', before: null },
    ]);
    // In the order of the bundle's keys, as they are planned.
    expect(plan.skipped.map(({ entryId, problem }) => [entryId, problem.code])).toEqual([
      [id('a', 'subject'), 'changed'],
      [id('a', 'subject'), 'empty-text'],
      [id('a', 'message'), 'invalid-text'],
      [id('gone', 'subject'), 'missing-key'],
    ]);
    expect(plan.changes).toEqual([]);
    expect(plan.planned).toEqual([]);
  });
});
