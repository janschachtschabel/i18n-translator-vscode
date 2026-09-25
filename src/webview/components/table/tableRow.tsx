import type { CellView, LocaleView, RowView } from '../../../shared/viewModel';
import { l10n } from '../../l10n';
import { SEVERITY_SYMBOLS, severityWord, statusWord } from '../cellStatus';
import { EmptyValue } from '../emptyValue';
import { LocaleLabel } from '../localeLabel';
import { memo } from '../memo';
import { entryAttribute } from '../useScrollAnchor';

/** Where the grid's keys move the focus to: row 0 is the header row, column 0 the key column. */
export function cellSelector(row: number, column: number): string {
  return `[data-row="${row}"][data-column="${column}"]`;
}

const describedBy = (row: number, column: number) => `grid-finding-${row}-${column}`;

interface RowProps {
  locales: readonly LocaleView[];
  /** The column of the cell that is the grid's tab stop, if it is in this row. */
  activeColumn: number | undefined;
}

export const HeaderRow = memo(({ locales, activeColumn }: RowProps) => {
  return (
    <div role="row" aria-rowindex={1} class="grid-row">
      <div role="columnheader" aria-colindex={1} class="grid-key" {...focusable(0, 0, activeColumn)}>
        {l10n.t('Key')}
      </div>
      {locales.map((locale, index) => (
        <div
          key={locale.code}
          role="columnheader"
          aria-colindex={index + 2}
          class="grid-cell"
          {...focusable(0, index + 1, activeColumn)}
        >
          <LocaleLabel locale={locale} />
        </div>
      ))}
    </div>
  );
});

/**
 * A key and its texts; `index` counts from 1, as the header is row 0. Memoized: moving the focus renders only
 * the two rows it leaves and enters, not all 2,000.
 */
export const TableRow = memo(
  ({ row, index, locales, activeColumn }: RowProps & { row: RowView; index: number }) => {
    const cells = locales.map((locale) => row.cells[locale.code] ?? { value: undefined, issues: [] });
    return (
      <div role="row" aria-rowindex={index + 1} class="grid-row" data-entry={entryAttribute(row.entryId)}>
        <div role="rowheader" aria-colindex={1} class="grid-key" {...focusable(index, 0, activeColumn)}>
          {row.key}
        </div>
        {cells.map((cell, position) => (
          <Cell
            key={locales[position]!.code}
            cell={cell}
            locale={locales[position]!}
            row={index}
            column={position + 1}
            activeColumn={activeColumn}
          />
        ))}
        {/* Hidden, so that they describe their cell without being part of its name. */}
        {cells.map(
          (cell, position) =>
            cell.issues.length > 0 && (
              <span key={`finding-${position}`} id={describedBy(index, position + 1)} hidden>
                {cell.issues.map((issue) => `${severityWord(issue.severity)}: ${issue.message}`).join(' ')}
              </span>
            ),
        )}
      </div>
    );
  },
);

interface CellProps {
  cell: CellView;
  locale: LocaleView;
  row: number;
  column: number;
  activeColumn: number | undefined;
}

function Cell({ cell, locale, row, column, activeColumn }: CellProps) {
  return (
    <div
      role="gridcell"
      aria-colindex={column + 1}
      class="grid-cell"
      aria-describedby={cell.issues.length > 0 ? describedBy(row, column) : undefined}
      {...focusable(row, column, activeColumn)}
    >
      {cell.value !== undefined && cell.value !== '' ? (
        <span class="cell-text" lang={locale.lang} dir="auto">
          {cell.value}
        </span>
      ) : (
        cell.issues.length === 0 && <EmptyValue value={cell.value} variant={locale.variant} />
      )}
      {cell.issues.map((issue, index) => (
        <span key={index} class="cell-status">
          {(index > 0 || (cell.value ?? '') !== '') && ' '}
          <span aria-hidden="true" class={`status-symbol ${issue.severity}`}>
            {SEVERITY_SYMBOLS[issue.severity]}
          </span>{' '}
          {statusWord(issue.rule)}
        </span>
      ))}
    </div>
  );
}

/** Every cell can take the focus; only the active one is in the tab order (roving tabindex). */
function focusable(row: number, column: number, activeColumn: number | undefined) {
  return { tabIndex: activeColumn === column ? 0 : -1, 'data-row': row, 'data-column': column };
}
