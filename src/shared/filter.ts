import type { BundleViewModel, CellView, RowView } from './viewModel';

export const FILTER_SCOPES = ['all', 'keys', 'texts'] as const;
export type FilterScope = (typeof FILTER_SCOPES)[number];
export const STATUS_FILTERS = ['all', 'missing', 'findings', 'empty'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Which rows of a bundle the editor shows; part of the view state the host keeps per bundle (B7). */
export interface RowFilter {
  /** What to look for; empty: no search. */
  query: string;
  /** Keys and texts, keys only, or texts only. */
  scope: FilterScope;
  /** With scope `texts`: the texts of this language only, even if it is hidden; null: of every visible one. */
  locale: string | null;
  regex: boolean;
  matchCase: boolean;
  status: StatusFilter;
}

/** Longest search; far longer than any key or text anyone looks for. */
export const MAX_QUERY_LENGTH = 1_000;

export const DEFAULT_FILTER: RowFilter = {
  query: '',
  scope: 'all',
  locale: null,
  regex: false,
  matchCase: false,
  status: 'all',
};

export interface FilterResult {
  rows: RowView[];
  /** Why the search was left out: the regular expression is invalid (the engine's reason, in English). */
  invalidPattern?: string;
}

/**
 * The rows that match the search and the status. Both look at the visible languages only; "missing" only at
 * the full ones, since a variant leaves most texts to its base language.
 */
export function filterRows(
  model: BundleViewModel,
  filter: RowFilter,
  hiddenLocales: readonly string[],
): FilterResult {
  const visible = model.locales.filter((locale) => !hiddenLocales.includes(locale.code));
  const full = new Set(visible.filter((locale) => !locale.variant).map((locale) => locale.code));
  const cells = (row: RowView, codes: Iterable<string>): CellView[] =>
    [...codes].flatMap((code) => row.cells[code] ?? []);
  const visibleCodes = visible.map((locale) => locale.code);

  const search = matcher(filter);
  const test = search.test;
  const textCodes = filter.scope === 'texts' && filter.locale !== null ? [filter.locale] : visibleCodes;
  const searched = (row: RowView): boolean =>
    test === undefined ||
    (filter.scope !== 'texts' && test(row.key)) ||
    (filter.scope !== 'keys' &&
      cells(row, textCodes).some((cell) => cell.value !== undefined && test(cell.value)));
  const hasStatus = (row: RowView): boolean => {
    switch (filter.status) {
      case 'all':
        return true;
      case 'missing':
        return cells(row, full).some((cell) => cell.issues.some((issue) => issue.rule === 'missing-key'));
      case 'findings':
        return cells(row, visibleCodes).some((cell) => cell.issues.length > 0);
      case 'empty':
        return cells(row, visibleCodes).some((cell) => cell.value === '');
    }
  };

  const rows = model.rows.filter((row) => hasStatus(row) && searched(row));
  return search.invalidPattern === undefined ? { rows } : { rows, invalidPattern: search.invalidPattern };
}

/** How to test a text against the query; no test for an empty query or an invalid regular expression. */
function matcher(filter: RowFilter): { test?: (text: string) => boolean; invalidPattern?: string } {
  if (filter.query === '') {
    return {};
  }
  if (filter.regex) {
    try {
      const pattern = new RegExp(filter.query, filter.matchCase ? 'u' : 'iu');
      return { test: (text) => pattern.test(text) };
    } catch (error) {
      // "Invalid regular expression: /(/iu: Unterminated group" → "Unterminated group"
      const message = (error as Error).message;
      const reason = message.lastIndexOf(': ');
      return { invalidPattern: reason < 0 ? message : message.slice(reason + 2) };
    }
  }
  if (filter.matchCase) {
    return { test: (text) => text.includes(filter.query) };
  }
  const query = filter.query.toLowerCase();
  return { test: (text) => text.toLowerCase().includes(query) };
}
