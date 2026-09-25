import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTER, filterRows, type RowFilter } from '../../../src/shared/filter';
import type { BundleViewModel } from '../../../src/shared/viewModel';
import { locale, row, text } from '../support/viewModels';

const model: BundleViewModel = {
  bundleId: JSON.stringify(['angular', '', 'common']),
  name: 'common',
  locales: [
    locale('de', { reference: true }),
    locale('de-informal', { variant: true }),
    locale('fr'),
    locale('it'),
  ],
  rows: [
    row('SAVE', {
      de: text('Speichern'),
      'de-informal': text(undefined),
      fr: text('Enregistrer'),
      it: text('Salva'),
    }),
    row('CANCEL', {
      de: text('Abbrechen'),
      'de-informal': text(undefined),
      fr: text(undefined, 'missing-key'),
      it: text('Annulla'),
    }),
    row('WORKSPACE.TITLE', {
      de: text('Arbeitsbereich'),
      'de-informal': text(undefined),
      fr: text('Espace de travail'),
      it: text('', 'empty-value'),
    }),
    row('ERROR_TITLE', {
      de: text('Fehler ({{date}})'),
      'de-informal': text(undefined),
      fr: text('Erreur ({{data}})', 'placeholder-mismatch'),
      it: text(undefined, 'missing-key'),
    }),
    row('ASK', {
      de: text('Möchten Sie fortfahren?'),
      'de-informal': text(undefined, 'variant-needed'),
      fr: text('Continuer ?'),
      it: text('Continuare?'),
    }),
  ],
  issues: [],
};

function keys(filter: Partial<RowFilter>, hidden: readonly string[] = []): string[] {
  return filterRows(model, { ...DEFAULT_FILTER, ...filter }, hidden).rows.map((candidate) => candidate.key);
}

const ALL = ['SAVE', 'CANCEL', 'WORKSPACE.TITLE', 'ERROR_TITLE', 'ASK'];

describe('filterRows', () => {
  it('keeps every row without a filter', () => {
    expect(filterRows(model, DEFAULT_FILTER, [])).toEqual({ rows: model.rows });
  });

  describe('search', () => {
    it('finds keys, ignoring case unless asked', () => {
      expect(keys({ query: 'title', scope: 'keys' })).toEqual(['WORKSPACE.TITLE', 'ERROR_TITLE']);
      expect(keys({ query: 'title', scope: 'keys', matchCase: true })).toEqual([]);
      expect(keys({ query: 'TITLE', scope: 'keys', matchCase: true })).toEqual([
        'WORKSPACE.TITLE',
        'ERROR_TITLE',
      ]);
    });

    it('finds texts in every visible language', () => {
      expect(keys({ query: 'espace', scope: 'texts' })).toEqual(['WORKSPACE.TITLE']);
      expect(keys({ query: 'espace', scope: 'texts' }, ['fr'])).toEqual([]);
      expect(keys({ query: 'title', scope: 'texts' })).toEqual([]);
    });

    it('finds texts in one language, even a hidden one', () => {
      expect(keys({ query: 'speichern', scope: 'texts', locale: 'fr' })).toEqual([]);
      expect(keys({ query: 'speichern', scope: 'texts', locale: 'de' })).toEqual(['SAVE']);
      expect(keys({ query: 'espace', scope: 'texts', locale: 'fr' }, ['fr'])).toEqual(['WORKSPACE.TITLE']);
    });

    it('finds keys and texts together', () => {
      expect(keys({ query: 'save' })).toEqual(['SAVE']);
      expect(keys({ query: 'annulla' })).toEqual(['CANCEL']);
      expect(keys({ query: 'annulla' }, ['it'])).toEqual([]);
    });

    it('finds regular expressions', () => {
      expect(keys({ query: '^(SAVE|ASK)$', scope: 'keys', regex: true })).toEqual(['SAVE', 'ASK']);
      expect(keys({ query: '^save$', scope: 'keys', regex: true })).toEqual(['SAVE']);
      expect(keys({ query: '^save$', scope: 'keys', regex: true, matchCase: true })).toEqual([]);
      expect(keys({ query: '\\{\\{\\w+\\}\\}', scope: 'texts', regex: true })).toEqual(['ERROR_TITLE']);
      expect(keys({ query: '\\p{Lu}{5}', scope: 'keys', regex: true, matchCase: true })).toEqual([
        'CANCEL',
        'WORKSPACE.TITLE',
        'ERROR_TITLE',
      ]);
    });

    it('does not search with an invalid regular expression and says why', () => {
      const result = filterRows(model, { ...DEFAULT_FILTER, query: '(', regex: true }, []);
      expect(result.rows.map((candidate) => candidate.key)).toEqual(ALL);
      expect(result.invalidPattern).toBe('Unterminated group');
      expect(keys({ query: '(', regex: true, status: 'empty' })).toEqual(['WORKSPACE.TITLE']);
    });

    it('takes an invalid pattern literally when it is not a regular expression', () => {
      expect(filterRows(model, { ...DEFAULT_FILTER, query: '(' }, []).invalidPattern).toBeUndefined();
      expect(keys({ query: '({{', scope: 'texts' })).toEqual(['ERROR_TITLE']);
    });
  });

  describe('status', () => {
    it('shows keys missing in a visible full language, not in variants', () => {
      expect(keys({ status: 'missing' })).toEqual(['CANCEL', 'ERROR_TITLE']);
      expect(keys({ status: 'missing' }, ['fr'])).toEqual(['ERROR_TITLE']);
    });

    it('shows keys with findings in a visible language', () => {
      expect(keys({ status: 'findings' })).toEqual(['CANCEL', 'WORKSPACE.TITLE', 'ERROR_TITLE', 'ASK']);
      expect(keys({ status: 'findings' }, ['de-informal', 'it'])).toEqual(['CANCEL', 'ERROR_TITLE']);
    });

    it('shows keys with an empty text in a visible language', () => {
      expect(keys({ status: 'empty' })).toEqual(['WORKSPACE.TITLE']);
      expect(keys({ status: 'empty' }, ['it'])).toEqual([]);
    });

    it('combines with the search', () => {
      expect(keys({ query: 'title', scope: 'keys', status: 'missing' })).toEqual(['ERROR_TITLE']);
      expect(keys({ query: 'title', scope: 'keys', status: 'empty' })).toEqual(['WORKSPACE.TITLE']);
    });
  });
});

describe('filterRows in combination', () => {
  it.each([
    { filter: { query: 'Espace', scope: 'texts', matchCase: true }, keys: ['WORKSPACE.TITLE'] },
    { filter: { query: 'ESPACE', scope: 'texts', matchCase: true }, keys: [] },
    {
      filter: { query: '^Espace', scope: 'texts', locale: 'fr', regex: true },
      hidden: ['fr'],
      keys: ['WORKSPACE.TITLE'],
    },
    { filter: { query: '^espace', scope: 'texts', locale: 'fr', regex: true, matchCase: true }, keys: [] },
    { filter: { query: 'fehler', scope: 'texts', status: 'findings' }, keys: ['ERROR_TITLE'] },
    { filter: { query: 'fehler', scope: 'texts', status: 'findings' }, hidden: ['fr', 'it'], keys: [] },
    { filter: { query: 'TITLE$', scope: 'keys', regex: true, status: 'empty' }, keys: ['WORKSPACE.TITLE'] },
    { filter: { query: 'a', scope: 'all', status: 'missing' }, keys: ['CANCEL', 'ERROR_TITLE'] },
  ] as { filter: Partial<RowFilter>; hidden?: string[]; keys: string[] }[])(
    'search $filter.query in $filter.scope with status $filter.status → $keys',
    ({ filter, hidden, keys: expected }) => {
      expect(keys(filter, hidden)).toEqual(expected);
    },
  );

  it('searches every visible language when the chosen one is no longer in the bundle', () => {
    expect(keys({ query: 'espace', scope: 'texts', locale: 'xx' })).toEqual(['WORKSPACE.TITLE']);
  });
});
