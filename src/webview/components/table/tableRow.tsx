import type { ComponentChildren } from 'preact';
import { l10n } from '../../l10n';
import type { OpenEditor } from '../../state/edits';
import { NO_TEXT, referenceTextOf, type ShownCell, type ShownRow } from '../../state/shownRows';
import type { EditorStore, LocaleColumn } from '../../state/store';
import { CellEditor } from '../cellEditor';
import { SEVERITY_SYMBOLS, severityWord, statusWord } from '../cellStatus';
import { EmptyValue } from '../emptyValue';
import { keyContext } from '../keyContext';
import { LocaleLabel } from '../localeLabel';
import { memo } from '../memo';
import { entryAttribute } from '../useScrollAnchor';

/** Where the grid's keys move the focus to: row 0 is the header row, column 0 the key column. */
export function cellSelector(row: number, column: number): string {
  return `[data-row="${row}"][data-column="${column}"]`;
}

const describedBy = (row: number, column: number) => `grid-finding-${row}-${column}`;

interface RowProps {
  locales: readonly LocaleColumn[];
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

interface TableRowProps extends RowProps {
  row: ShownRow;
  index: number;
  store: EditorStore;
  /** The code of the reference language. */
  reference: string | undefined;
  /** The open editor, if it is in this row. */
  editor: OpenEditor | undefined;
}

/**
 * A key and its texts; `index` counts from 1, as the header is row 0. Memoized: moving the focus renders only
 * the two rows it leaves and enters, not all 2,000.
 */
export const TableRow = memo(
  ({ row, index, locales, activeColumn, store, reference, editor }: TableRowProps) => {
    const cells = locales.map((locale) => row.cells[locale.code] ?? NO_TEXT);
    return (
      <div
        role="row"
        aria-rowindex={index + 1}
        class="grid-row"
        data-entry={entryAttribute(row.entryId)}
        data-vscode-context={keyContext(row.entryId, store.mailPreview.value)}
      >
        <div
          role="rowheader"
          aria-colindex={1}
          class="grid-key"
          // The keys the grid's help names, on the cell with the focus.
          aria-keyshortcuts={activeColumn === 0 ? 'F2 Delete' : undefined}
          {...focusable(index, 0, activeColumn)}
        >
          {row.key}
        </div>
        {cells.map((cell, position) => {
          const locale = locales[position]!;
          return (
            <Cell
              key={locale.code}
              cell={cell}
              locale={locale}
              row={index}
              column={position + 1}
              activeColumn={activeColumn}
            >
              {editor?.locale === locale.code && (
                <CellEditor
                  store={store}
                  editor={editor}
                  locale={locale}
                  keyText={row.key}
                  referenceText={referenceTextOf(row, reference, locale.code)}
                />
              )}
            </Cell>
          );
        })}
        {/* Hidden, so that they describe their cell without being part of its name. */}
        {cells.map((cell, position) => {
          const text = description(cell);
          return (
            text !== undefined && (
              <span key={`finding-${position}`} id={describedBy(index, position + 1)} hidden>
                {text}
              </span>
            )
          );
        })}
      </div>
    );
  },
);

interface CellProps {
  cell: ShownCell;
  locale: LocaleColumn;
  row: number;
  column: number;
  activeColumn: number | undefined;
  /** The editor, while the text is edited: it takes the place of the text in the same cell. */
  children: ComponentChildren;
}

function Cell({ cell, locale, row, column, activeColumn, children }: CellProps) {
  const editing = Boolean(children);
  const statuses = [
    ...(cell.notSaved !== undefined ? [{ severity: 'error' as const, word: l10n.t('not saved') }] : []),
    ...cell.issues.map((issue) => ({ severity: issue.severity, word: statusWord(issue.rule) })),
  ];
  return (
    <div
      role="gridcell"
      aria-colindex={column + 1}
      class={editing ? 'grid-cell editing' : 'grid-cell'}
      aria-describedby={description(cell) !== undefined ? describedBy(row, column) : undefined}
      aria-keyshortcuts={activeColumn === column && !editing ? 'Enter F2' : undefined}
      {...focusable(row, column, activeColumn)}
    >
      {editing ? (
        children
      ) : (
        <>
          {cell.value !== undefined && cell.value !== '' ? (
            <span class="cell-text" lang={locale.lang} dir="auto">
              {cell.value}
            </span>
          ) : (
            statuses.length === 0 && <EmptyValue value={cell.value} variant={locale.variant} />
          )}
          {statuses.map((status, index) => (
            <span key={index} class="cell-status">
              {(index > 0 || (cell.value ?? '') !== '') && ' '}
              <span aria-hidden="true" class={`status-symbol ${status.severity}`}>
                {SEVERITY_SYMBOLS[status.severity]}
              </span>{' '}
              {status.word}
            </span>
          ))}
        </>
      )}
    </div>
  );
}

/** What describes a cell: why its text was not saved, and its findings. */
function description(cell: ShownCell): string | undefined {
  const lines = [
    ...(cell.notSaved !== undefined ? [l10n.t('Not saved: {message}', { message: cell.notSaved })] : []),
    ...cell.issues.map((issue) => `${severityWord(issue.severity)}: ${issue.message}`),
  ];
  return lines.length > 0 ? lines.join(' ') : undefined;
}

/** Every cell can take the focus; only the active one is in the tab order (roving tabindex). */
function focusable(row: number, column: number, activeColumn: number | undefined) {
  return { tabIndex: activeColumn === column ? 0 : -1, 'data-row': row, 'data-column': column };
}
