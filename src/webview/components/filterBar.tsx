import { MAX_QUERY_LENGTH, type FilterScope, type RowFilter, type StatusFilter } from '../../shared/filter';
import { useEffect, useRef } from 'preact/hooks';
import type { BundleViewModel } from '../../shared/viewModel';
import { formatNumber, l10n } from '../l10n';
import type { EditorStore } from '../state/store';
import './filterBar.css';
import { localeName } from './localeName';

/** Ctrl+F puts the cursor here (shortcuts.ts). */
export const SEARCH_FIELD_ID = 'filter-query';
export const RESULT_ID = 'filter-result';
/** Screen readers hear the result once typing pauses, not after every key. */
const ANNOUNCE_AFTER_MS = 700;

/** Search and status filter, and how many keys they let through. */
export function FilterBar({ store, model }: { store: EditorStore; model: BundleViewModel }) {
  const { filter } = store.uiState.value;
  const result = store.filtered.value;
  const invalid = result?.invalidPattern;
  // A kept language that is gone from the bundle counts as none, as in filterRows.
  const chosen = model.locales.some((locale) => locale.code === filter.locale) ? filter.locale : null;
  const scope = filter.scope === 'texts' && chosen !== null ? `texts:${chosen}` : filter.scope;
  const counted = l10n.t('Keys: {shown} of {total}', {
    shown: formatNumber(result?.rows.length ?? 0),
    total: formatNumber(model.rows.length),
  });
  useAnnounceAfterPause(
    store,
    invalid !== undefined ? `${l10n.t('The regular expression is invalid:')} ${invalid}` : counted,
    filter,
  );
  const statuses: [StatusFilter, string][] = [
    ['all', l10n.t('all keys')],
    ['missing', l10n.t('keys with missing texts')],
    ['findings', l10n.t('keys with findings')],
    ['empty', l10n.t('keys with empty texts')],
  ];
  return (
    <div role="search" class="filter">
      <span class="field">
        <label for={SEARCH_FIELD_ID}>{l10n.t('Search')}</label>
        <input
          id={SEARCH_FIELD_ID}
          type="search"
          value={filter.query}
          maxLength={MAX_QUERY_LENGTH}
          aria-keyshortcuts="Control+F Meta+F"
          aria-invalid={invalid !== undefined}
          aria-describedby={invalid !== undefined ? RESULT_ID : undefined}
          onInput={(event) => store.updateFilter({ query: event.currentTarget.value })}
        />
      </span>
      <label class="field">
        {l10n.t('Search in')}
        <select
          value={scope}
          onChange={(event) => {
            const value = event.currentTarget.value;
            store.updateFilter(
              value.startsWith('texts:')
                ? { scope: 'texts', locale: value.slice('texts:'.length) }
                : { scope: value as FilterScope, locale: null },
            );
          }}
        >
          <option value="all">{l10n.t('keys and texts')}</option>
          <option value="keys">{l10n.t('keys')}</option>
          <option value="texts">{l10n.t('texts')}</option>
          {model.locales.map((locale) => (
            <option key={locale.code} value={`texts:${locale.code}`}>
              {l10n.t('texts in {locale}', { locale: localeName(locale) })}
            </option>
          ))}
        </select>
      </label>
      <label class="option">
        <input
          type="checkbox"
          checked={filter.regex}
          onChange={() => store.updateFilter({ regex: !filter.regex })}
        />
        {l10n.t('Regular expression')}
      </label>
      <label class="option">
        <input
          type="checkbox"
          checked={filter.matchCase}
          onChange={() => store.updateFilter({ matchCase: !filter.matchCase })}
        />
        {l10n.t('Match case')}
      </label>
      <label class="field">
        {l10n.t('Show')}
        <select
          value={filter.status}
          aria-keyshortcuts="Alt+M"
          onChange={(event) => store.updateFilter({ status: event.currentTarget.value as StatusFilter })}
        >
          {statuses.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {/* Not a live region: typing would announce every count. It can take the focus of a skip link. */}
      <p id={RESULT_ID} class="filter-result" tabIndex={-1}>
        {invalid !== undefined ? (
          <>
            <span aria-hidden="true" class="status-symbol error">
              ✖
            </span>{' '}
            {l10n.t('The regular expression is invalid:')} <span lang="en">{invalid}</span>
          </>
        ) : (
          counted
        )}
      </p>
    </div>
  );
}

/**
 * Has screen readers read `text` once it stopped changing for a moment after a change of `filter`: not when the
 * editor opens, and not when only the bundle changed (a saved text, a file changed on disk), which would
 * interrupt. A change of the bundle during the pause after a change of the filter has the text read as it is then.
 */
function useAnnounceAfterPause(store: EditorStore, text: string, filter: RowFilter): void {
  const announced = useRef(filter);
  const due = useRef(false);
  useEffect(() => {
    if (filter !== announced.current) {
      announced.current = filter;
      due.current = true;
    }
    if (!due.current) {
      return undefined;
    }
    const timer = setTimeout(() => {
      due.current = false;
      store.announce(text);
    }, ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [store, text, filter]);
}
