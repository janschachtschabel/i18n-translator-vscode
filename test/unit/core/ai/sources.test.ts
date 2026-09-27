import { describe, expect, it } from 'vitest';
import { checkEntries, contextTexts, fillEntries, sourceLocale } from '../../../../src/core/ai/sources';
import { keyFromId, keyFromSegments } from '../../../../src/core/model/keys';
import { analyzeFixtureWorkspace } from '../../support/fixtureWorkspace';

const { analysis } = analyzeFixtureWorkspace();
const common = analysis.bundles.find((bundle) => bundle.name === 'common')!;
const id = (dotted: string) => keyFromSegments(dotted.split('.')).id;
const VARIANTS = { 'de-informal': { base: 'de' }, 'de-no-binnen-i': { base: 'de' } };

describe('sourceLocale', () => {
  it('translates from the reference, a variant from its base, and the reference from nothing', () => {
    expect(sourceLocale(common, 'fr', VARIANTS)).toBe('de');
    expect(sourceLocale(common, 'de-informal', VARIANTS)).toBe('de');
    // A base the bundle lacks: the reference.
    expect(sourceLocale(common, 'de-informal', { 'de-informal': { base: 'xx' } })).toBe('de');
    expect(sourceLocale(common, 'de', VARIANTS)).toBeUndefined();
  });
});

describe('contextTexts', () => {
  it('takes up to three other languages with a text, English first, leaving out the given ones', () => {
    expect(contextTexts(common, id('SAVE'), ['de', 'fr', 'de-informal', 'de-no-binnen-i'])).toEqual({
      en: 'Save',
      it: 'Salva',
    });
    expect(Object.keys(contextTexts(common, id('SAVE'), ['de'], 1))).toEqual(['en']);
  });
});

describe('fillEntries', () => {
  it('fills what the findings name, in the order of the keys, with the text each starts from', () => {
    expect(fillEntries(common, analysis.issues, 'fr', ['missing'], 'de')).toEqual([
      { entryId: id('CANCEL'), before: null },
      { entryId: id('WORKSPACE.FILE.TITLE'), before: null },
    ]);
    expect(fillEntries(common, analysis.issues, 'fr', ['missing', 'empty'], 'de')).toEqual([
      { entryId: id('SAVE'), before: '' },
      { entryId: id('CANCEL'), before: null },
      { entryId: id('WORKSPACE.FILE.TITLE'), before: null },
    ]);
    expect(fillEntries(common, analysis.issues, 'de-no-binnen-i', ['variant-needed'], 'de')).toEqual([
      { entryId: id('PERSON'), before: null },
    ]);
  });

  it('leaves out keys without a text to translate from', () => {
    const withoutSource = fillEntries(common, analysis.issues, 'fr', ['missing'], 'de-informal');
    expect(withoutSource.map((entry) => entry.entryId)).not.toContain(id('CANCEL'));
  });
});

describe('checkEntries', () => {
  const keysOf = (entries: { entryId: string }[]) =>
    entries.map((entry) => keyFromId(entry.entryId).segments.join(' / '));

  it('checks the texts a language has, where there is a text to check against, in the order of the keys', () => {
    // Not SAVE (empty in fr), nor CANCEL and WORKSPACE.FILE.TITLE (missing).
    expect(keysOf(checkEntries(common, 'fr', 'de'))).toEqual([
      'ERROR_TITLE',
      'PERSON',
      'ASK',
      'MINUTE',
      'OK',
      'BOLD_HINT',
      'MIME / application/vnd.ms-excel',
      'CCMAIL / mail.smtp.server',
      'WORKSPACE / TITLE',
    ]);
    expect(checkEntries(common, 'fr', 'de')[0]).toEqual({
      entryId: id('ERROR_TITLE'),
      before: 'Erreur ({{data}})',
    });
    // A variant: its own texts, against its base.
    expect(checkEntries(common, 'de-informal', 'de')).toEqual([
      { entryId: id('ASK'), before: 'Möchtest Du fortfahren?' },
    ]);
  });
});
