import { useLayoutEffect, useRef } from 'preact/hooks';
import type { CellView, LocaleView, RowView } from '../../../shared/viewModel';
import type { EditorStore } from '../../state/store';
import { SEVERITY_SYMBOLS } from '../cellStatus';
import { LocaleLabel } from '../localeLabel';
import { memo } from '../memo';
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
  const list = useRef<HTMLOListElement>(null);
  // Taken once: the key of a table that went while it had the focus.
  const handoff = useRef(store.takeFocusHandoff());
  const handoffRow = handoff.current ? rows.findIndex((row) => row.entryId === handoff.current) + 1 : 0;
  const count = useIncrementalCount(rows.length, handoffRow);
  const page = useRef(document.scrollingElement as HTMLElement | null);
  useScrollAnchor(store, page);

  useLayoutEffect(() => {
    if (handoff.current === undefined) {
      return;
    }
    const card = handoff.current
      ? list.current?.querySelector(`[data-entry="${entryAttribute(handoff.current)}"]`)
      : list.current?.firstElementChild;
    handoff.current = undefined;
    card?.querySelector<HTMLElement>('h2')?.focus();
  }, []);

  return (
    <ol ref={list} class="cards" aria-labelledby={labelledBy}>
      {rows.slice(0, count).map((row) => (
        <Card key={row.entryId} row={row} locales={locales} />
      ))}
    </ol>
  );
}

const Card = memo(({ row, locales }: { row: RowView; locales: readonly LocaleView[] }) => (
  <li class="card" data-entry={entryAttribute(row.entryId)}>
    {/* It can take the focus, so that the focus has a place when the list replaces the table. */}
    <h2 class="card-key" tabIndex={-1}>
      {row.key}
    </h2>
    <dl class="card-fields">
      {locales.map((locale) => (
        <Field key={locale.code} locale={locale} cell={row.cells[locale.code] ?? NO_TEXT} />
      ))}
    </dl>
  </li>
));

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
