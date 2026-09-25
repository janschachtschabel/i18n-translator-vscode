import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { LocaleView, RowView } from '../../../shared/viewModel';
import { moveInGrid, type GridPosition } from '../../a11y/gridKeys';
import type { EditorStore } from '../../state/store';
import { useIncrementalCount } from '../useIncrementalCount';
import { useScrollAnchor } from '../useScrollAnchor';
import { cellAt, nextOpenPoint, pageSize, positionOf, type ActiveCell } from './gridPosition';
import './table.css';
import { cellSelector, HeaderRow, TableRow } from './tableRow';

interface TableProps {
  store: EditorStore;
  rows: readonly RowView[];
  /** The languages shown, in the bundle's order. */
  locales: readonly LocaleView[];
  wrap: boolean;
  /** The id of the heading that names the grid. */
  labelledBy: string;
}

/**
 * The bundle as an ARIA grid (design §7.4): one tab stop, moved with the keys of a data grid. It stays when no
 * row matches the filter, so that its tab stop, the focus and the active key stay too.
 */
export function Table({ store, rows, locales, wrap, labelledBy }: TableProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveCell>(() => ({
    entryId: rows[0]?.entryId ?? null,
    locale: locales[0]?.code ?? null,
  }));
  const position = positionOf(active, rows, locales);
  const count = useIncrementalCount(rows.length, position.row);
  /** Whether the focus is in the grid; after a render it goes back to the active cell if it got lost. */
  const focused = useRef(false);
  const lastActive = useRef(active);
  lastActive.current = active;
  useScrollAnchor(store, scroller);

  useLayoutEffect(() => {
    const element = scroller.current;
    const cell = element?.querySelector<HTMLElement>(cellSelector(position.row, position.column));
    const current = document.activeElement;
    // Only a focus that got lost comes back, not one the user took elsewhere meanwhile (e.g. with Ctrl+F).
    const lost = current === null || current === document.body || (element?.contains(current) ?? false);
    if (focused.current && cell && current !== cell && lost) {
      cell.focus({ preventScroll: true });
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });

  // When the list takes the table's place with the focus in it, the list gives it to the card of the key.
  useLayoutEffect(
    () => () => {
      if (scroller.current?.contains(document.activeElement)) {
        store.handOffFocus(lastActive.current.entryId);
      }
    },
    [store],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      // Space would scroll the table away from the focused cell; it gets its own meaning with editing.
      event.preventDefault();
      return;
    }
    const openPoint = openPointDirection(event);
    const next =
      openPoint !== undefined
        ? nextOpenPoint(position, openPoint, rows, locales)
        : moveInGrid(position, event, {
            rows: rows.length + 1,
            columns: locales.length + 1,
            page: pageSize(scroller.current),
          });
    if (!next) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!samePosition(next, position)) {
      setActive(cellAt(next, rows, locales));
    }
  };
  const onFocusIn = (event: FocusEvent) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-row]');
    focused.current = true;
    if (cell) {
      const at = { row: Number(cell.dataset['row']), column: Number(cell.dataset['column']) };
      if (!samePosition(at, position)) {
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
        class={locales.length > 0 ? 'grid' : 'grid no-languages'}
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

/** Alt+Down and Alt+Up go to the next and the previous open point (design §7.2). */
function openPointDirection(event: KeyboardEvent): 1 | -1 | undefined {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return undefined;
  }
  return event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : undefined;
}

function samePosition(a: GridPosition, b: GridPosition): boolean {
  return a.row === b.row && a.column === b.column;
}
