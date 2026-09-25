import { useRef } from 'preact/hooks';
import type { CellView, LocaleView, RowView } from '../../../shared/viewModel';
import type { EditorStore } from '../../state/store';
import { SEVERITY_SYMBOLS } from '../cellStatus';
import { LocaleLabel } from '../localeLabel';
import { useIncrementalCount } from '../useIncrementalCount';
import { entryAttribute, useScrollAnchor } from '../useScrollAnchor';
import './list.css';

interface ListProps {
  store: EditorStore;
  rows: readonly RowView[];
  /** The languages each card shows, in this order. */
  locales: readonly LocaleView[];
  /** The id of the heading that names the list. */
  labelledBy: string;
}

const NO_TEXT: CellView = { value: undefined, issues: [] };

/**
 * A card per key with a labelled field per language (design §7.4: the form-like alternative to the grid). The
 * page scrolls as a whole, as one scroll area suits narrow editors better than two.
 */
export function List({ store, rows, locales, labelledBy }: ListProps) {
  const { count } = useIncrementalCount(rows.length);
  const page = useRef(document.scrollingElement as HTMLElement | null);
  useScrollAnchor(store, page);
  return (
    <ol class="cards" aria-labelledby={labelledBy}>
      {rows.slice(0, count).map((row) => (
        <li key={row.entryId} class="card" data-entry={entryAttribute(row.entryId)}>
          <h2 class="card-key">{row.key}</h2>
          <dl class="card-fields">
            {locales.map((locale) => (
              <Field key={locale.code} locale={locale} cell={row.cells[locale.code] ?? NO_TEXT} />
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

function Field({ locale, cell }: { locale: LocaleView; cell: CellView }) {
  return (
    <div class="card-field">
      <dt>
        <LocaleLabel locale={locale} />
      </dt>
      <dd>
        {cell.value !== undefined && cell.value !== '' && (
          <span class="cell-text" lang={locale.code} dir="auto">
            {cell.value}
          </span>
        )}
        {cell.issues.map((issue, index) => (
          <p key={index} class="card-finding">
            <span aria-hidden="true" class={`status-symbol ${issue.severity}`}>
              {SEVERITY_SYMBOLS[issue.severity]}
            </span>{' '}
            {issue.message}
          </p>
        ))}
      </dd>
    </div>
  );
}
