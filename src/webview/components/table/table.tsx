import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { LocaleView, RowView } from '../../../shared/viewModel';
import { moveInGrid, type GridPosition } from '../../a11y/gridKeys';
import type { EditorStore } from '../../state/store';
import './table.css';
import { cellSelector, HeaderRow, TableRow } from './tableRow';
import { useIncrementalCount } from '../useIncrementalCount';
import { useScrollAnchor } from '../useScrollAnchor';

/** The grid's tab stop by what it shows, so it stays on its key when rows come and go: null is the header row or the key column. */
interface ActiveCell {
  entryId: string | null;
  locale: string | null;
}

interface TableProps {
  store: EditorStore;
  rows: readonly RowView[];
  /** The visible languages, in the bundle's order. */
  locales: readonly LocaleView[];
  wrap: boolean;
  /** The id of the heading that names the grid. */
  labelledBy: string;
}

/** The bundle as an ARIA grid (design §7.4): one tab stop, moved with the keys of a data grid. */
export function Table({ store, rows, locales, wrap, labelledBy }: TableProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveCell>(() => ({
    entryId: rows[0]?.entryId ?? null,
    locale: locales[0]?.code ?? null,
  }));
  const position = positionOf(active, rows, locales);
  const { count, renderAtLeast } = useIncrementalCount(rows.length);
  /** Whether the focus is in the grid; after a render it goes back to the active cell if it got lost. */
  const focused = useRef(false);
  useScrollAnchor(store, scroller);

  useLayoutEffect(() => {
    const cell = scroller.current?.querySelector<HTMLElement>(cellSelector(position.row, position.column));
    if (focused.current && cell && document.activeElement !== cell) {
      cell.focus({ preventScroll: true });
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });

  const onKeyDown = (event: KeyboardEvent) => {
    const next = moveInGrid(position, event, {
      rows: rows.length + 1,
      columns: locales.length + 1,
      page: pageSize(scroller.current),
    });
    if (!next) {
      return;
    }
    event.preventDefault();
    renderAtLeast(next.row);
    setActive(cellAt(next, rows, locales));
  };
  const onFocusIn = (event: FocusEvent) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-row]');
    focused.current = true;
    if (cell) {
      const at = { row: Number(cell.dataset['row']), column: Number(cell.dataset['column']) };
      if (at.row !== position.row || at.column !== position.column) {
        setActive(cellAt(at, rows, locales));
      }
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    const target = event.relatedTarget as Node | null;
    if (target !== null) {
      focused.current = scroller.current?.contains(target) ?? false;
      return;
    }
    // No new target: a click beside the controls, or the cell went away with its row. Only then does the
    // focus come back to the active cell (in the layout effect, which runs before this check).
    const cell = event.target as HTMLElement;
    queueMicrotask(() => {
      if (cell.isConnected) {
        focused.current = false;
      }
    });
  };

  return (
    <div ref={scroller} class={wrap ? 'table-scroller wrap' : 'table-scroller'}>
      <div
        role="grid"
        aria-labelledby={labelledBy}
        aria-rowcount={rows.length + 1}
        aria-colcount={locales.length + 1}
        class="grid"
        style={{ '--columns': String(locales.length) }}
        onKeyDown={onKeyDown}
        onFocusIn={onFocusIn}
        onFocusOut={onFocusOut}
      >
        <div role="rowgroup" class="grid-head">
          <HeaderRow locales={locales} activeColumn={position.row === 0 ? position.column : undefined} />
        </div>
        <div role="rowgroup" class="grid-body">
          {rows.slice(0, count).map((row, index) => (
            <TableRow
              key={row.entryId}
              row={row}
              index={index + 1}
              locales={locales}
              activeColumn={position.row === index + 1 ? position.column : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Where the active cell is now; if its key or language is gone, the first cell of the grid. */
function positionOf(
  active: ActiveCell,
  rows: readonly RowView[],
  locales: readonly LocaleView[],
): GridPosition {
  const row =
    active.entryId === null ? 0 : rows.findIndex((candidate) => candidate.entryId === active.entryId) + 1;
  const column =
    active.locale === null ? 0 : locales.findIndex((locale) => locale.code === active.locale) + 1;
  if (row < 0 || (active.entryId !== null && row === 0) || (active.locale !== null && column === 0)) {
    return { row: rows.length > 0 ? 1 : 0, column: locales.length > 0 ? 1 : 0 };
  }
  return { row, column };
}

function cellAt(at: GridPosition, rows: readonly RowView[], locales: readonly LocaleView[]): ActiveCell {
  return {
    entryId: at.row === 0 ? null : (rows[at.row - 1]?.entryId ?? null),
    locale: at.column === 0 ? null : (locales[at.column - 1]?.code ?? null),
  };
}

/** Rows that fit into the view, for Page Up/Down; 10 before the table has a size. */
function pageSize(scroller: HTMLElement | null): number {
  const row = scroller?.querySelector<HTMLElement>('.grid-body [role="row"]');
  if (!scroller || !row || row.offsetHeight === 0) {
    return 10;
  }
  return Math.max(1, Math.floor(scroller.clientHeight / row.offsetHeight) - 1);
}
