import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { moveInGrid, type GridPosition } from '../../a11y/gridKeys';
import type { ShownRow } from '../../state/shownRows';
import type { EditorStore, LocaleColumn } from '../../state/store';
import { EDITOR_CLASS } from '../cellEditor';
import { focusIsLost, onFocusLeaving } from '../focus';
import { useIncrementalCount } from '../useIncrementalCount';
import { useScrollAnchor } from '../useScrollAnchor';
import { cellAt, nextOpenPoint, pageSize, positionOf, type ActiveCell } from './gridPosition';
import './table.css';
import { cellSelector, HeaderRow, TableRow } from './tableRow';

interface TableProps {
  store: EditorStore;
  rows: readonly ShownRow[];
  /** The languages shown, in the bundle's order. */
  locales: readonly LocaleColumn[];
  /** The code of the reference language, whose texts the editor checks against. */
  reference: string | undefined;
  wrap: boolean;
  /** The id of the heading that names the grid. */
  labelledBy: string;
  /** The id of the line that says which keys edit, rename and delete. */
  describedBy: string;
}

/**
 * The bundle as an ARIA grid (design §7.4): one tab stop, moved with the keys of a data grid. It stays when no
 * row matches the filter, so that its tab stop, the focus and the active key stay too.
 */
export function Table({ store, rows, locales, reference, wrap, labelledBy, describedBy }: TableProps) {
  const scroller = useRef<HTMLDivElement>(null);
  // Taken once, on the first render (Preact unmounts the old layout first): where the focus was in the list.
  const [handoff] = useState(() => store.takeFocusHandoff());
  const [active, setActive] = useState<ActiveCell>(
    () => handoff ?? { entryId: rows[0]?.entryId ?? null, locale: locales[0]?.code ?? null },
  );
  const lastPosition = useRef<GridPosition>({ row: 1, column: 1 });
  const position = positionOf(active, rows, locales, lastPosition.current);
  lastPosition.current = position;
  const open = store.edits.open.value;
  // An editor in the details is theirs.
  const editor = open?.place === 'rows' ? open : undefined;
  const editorRow = editor ? rows.findIndex((row) => row.entryId === editor.entryId) + 1 : 0;
  const count = useIncrementalCount(rows.length, Math.max(position.row, editorRow));
  /** Whether the focus is in the grid; after a render it goes back to the active cell if it got lost. */
  const focused = useRef(handoff !== undefined);
  // The cell at the active position: the key that took the place of one that went, not the one that went.
  const lastActive = useRef(active);
  lastActive.current = cellAt(position, rows, locales);
  useScrollAnchor(store, scroller);

  useLayoutEffect(() => {
    const element = scroller.current;
    const cell = element?.querySelector<HTMLElement>(cellSelector(position.row, position.column));
    const current = document.activeElement;
    // Only a focus that got lost comes back, not one the user took elsewhere meanwhile (e.g. with Ctrl+F),
    // and not one in an editor, which takes it before the cell it is in becomes the active one.
    const lost =
      focusIsLost() || ((element?.contains(current) ?? false) && !current?.closest(`.${EDITOR_CLASS}`));
    if (focused.current && cell && !cell.contains(current) && lost) {
      cell.focus({ preventScroll: true });
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });

  // The details show the key of the active cell; in the header row, the one they show stays.
  const activeKey = position.row > 0 ? rows[position.row - 1]?.entryId : undefined;
  useLayoutEffect(() => {
    if (activeKey !== undefined) {
      store.detailsKey.value = activeKey;
    }
  }, [store, activeKey]);

  // When the list takes the table's place with the focus in the grid, the list gives it to the card of the key.
  useLayoutEffect(
    () => () => {
      if (scroller.current?.contains(document.activeElement)) {
        store.handOffFocus('table', lastActive.current);
      }
    },
    [store],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    // Keys typed in an editor are its own.
    if (!target.matches('[data-row]')) {
      return;
    }
    if (event.key === ' ') {
      // Space would scroll the table away from the focused cell.
      event.preventDefault();
      return;
    }
    const at = cellPosition(target);
    const keyCommand = at.column === 0 && at.row > 0 ? keyCommandOf(event) : undefined;
    if (keyCommand) {
      event.preventDefault();
      event.stopPropagation();
      store.command(keyCommand, rows[at.row - 1]!.entryId);
      return;
    }
    if (isEditKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      // The cell the key was pressed in, even if the grid has not caught up with the focus yet.
      editAt(at);
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
  /** Opens the editor of a text; the key column and the header row have none. */
  const editAt = (at: GridPosition) => {
    const row = rows[at.row - 1];
    const locale = locales[at.column - 1];
    if (at.row > 0 && at.column > 0 && row && locale) {
      store.edit(row.entryId, locale.code);
    }
  };
  // A click opens the editor, as in the old app; one with a modifier, or one that ends a selection of text, selects.
  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const cell = target.closest<HTMLElement>('[data-row]');
    const modified = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
    const selecting = document.getSelection()?.isCollapsed === false;
    if (cell && !target.closest(`.${EDITOR_CLASS}`) && !modified && !selecting) {
      editAt(cellPosition(cell));
    }
  };
  const onFocusIn = (event: FocusEvent) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-row]');
    focused.current = true;
    if (cell) {
      const at = cellPosition(cell);
      if (!samePosition(at, position)) {
        setActive(cellAt(at, rows, locales));
      }
    }
  };
  // When the cell with the focus went away with its row, the focus comes back to the active cell (in the layout
  // effect, which runs before this check).
  const onFocusOut = (event: FocusEvent) =>
    onFocusLeaving(event, scroller.current, () => {
      focused.current = false;
    });

  return (
    <div ref={scroller} class={wrap ? 'table-scroller wrap' : 'table-scroller'}>
      <div
        role="grid"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-rowcount={rows.length + 1}
        aria-colcount={locales.length + 1}
        class={locales.length > 0 ? 'grid' : 'grid no-languages'}
        style={{ '--columns': String(locales.length) }}
        onKeyDown={onKeyDown}
        onFocusIn={onFocusIn}
        onFocusOut={onFocusOut}
        onClick={onClick}
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
              store={store}
              reference={reference}
              editor={editor?.entryId === row.entryId ? editor : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * In the key column, F2 renames the key and Delete deletes it (on macOS, whose keyboards have no Delete key, also
 * Cmd+Backspace, as in VS Code's lists); the host asks first.
 */
function keyCommandOf(event: KeyboardEvent): 'renameKey' | 'deleteKey' | undefined {
  if (event.key === 'Backspace' && event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey) {
    return 'deleteKey';
  }
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return undefined;
  }
  return event.key === 'F2' ? 'renameKey' : event.key === 'Delete' ? 'deleteKey' : undefined;
}

/** Enter or F2 opens the editor of a cell (design §7.2). */
function isEditKey(event: KeyboardEvent): boolean {
  const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  return plain && (event.key === 'Enter' || event.key === 'F2');
}

/** Alt+Down and Alt+Up go to the next and the previous open point (design §7.2). */
function openPointDirection(event: KeyboardEvent): 1 | -1 | undefined {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return undefined;
  }
  return event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : undefined;
}

/** Where a cell of the grid is, from its data attributes. */
function cellPosition(cell: HTMLElement): GridPosition {
  return { row: Number(cell.dataset['row']), column: Number(cell.dataset['column']) };
}

function samePosition(a: GridPosition, b: GridPosition): boolean {
  return a.row === b.row && a.column === b.column;
}
