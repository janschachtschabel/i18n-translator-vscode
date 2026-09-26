import type { RowView } from '../../../shared/viewModel';
import type { GridPosition } from '../../a11y/gridKeys';

/** The grid's tab stop by what it shows, so it stays on its key when rows come and go: null is the header row or the key column. */
export interface ActiveCell {
  entryId: string | null;
  locale: string | null;
}

/**
 * Where the active cell is now. If its key or its language is gone, the cell stays where it was (`last`), so
 * that the row or language that takes the place gets it: e.g. the next key once a missing text is there.
 */
export function positionOf(
  active: ActiveCell,
  rows: readonly RowView[],
  locales: readonly { code: string }[],
  last: GridPosition,
): GridPosition {
  const row =
    active.entryId === null ? 0 : rows.findIndex((candidate) => candidate.entryId === active.entryId) + 1;
  const column =
    active.locale === null ? 0 : locales.findIndex((locale) => locale.code === active.locale) + 1;
  return {
    row: active.entryId !== null && row === 0 ? inside(last.row, rows.length) : row,
    column: active.locale !== null && column === 0 ? inside(last.column, locales.length) : column,
  };
}

/** A row or column of the body (from 1 to `count`) near `index`; 0, the header, if there is none. */
function inside(index: number, count: number): number {
  return Math.min(Math.max(index, 1), count);
}

export function cellAt(
  at: GridPosition,
  rows: readonly RowView[],
  locales: readonly { code: string }[],
): ActiveCell {
  return {
    entryId: at.row === 0 ? null : (rows[at.row - 1]?.entryId ?? null),
    locale: at.column === 0 ? null : (locales[at.column - 1]?.code ?? null),
  };
}

/**
 * The next row (direction 1) or the previous one (-1) with a finding in the active language, or in any shown
 * language from the key column (design §7.2: Alt+Down/Up); the same cell if there is none.
 */
export function nextOpenPoint(
  from: GridPosition,
  direction: 1 | -1,
  rows: readonly RowView[],
  locales: readonly { code: string }[],
): GridPosition {
  const codes = from.column === 0 ? locales.map((locale) => locale.code) : [locales[from.column - 1]!.code];
  for (let row = from.row + direction; row >= 1 && row <= rows.length; row += direction) {
    const cells = rows[row - 1]!.cells;
    if (codes.some((code) => (cells[code]?.issues.length ?? 0) > 0)) {
      return { row, column: from.column };
    }
  }
  return from;
}

/** Rows that fit into the view, for Page Up/Down; 10 before the table has a size. */
export function pageSize(scroller: HTMLElement | null): number {
  const row = scroller?.querySelector<HTMLElement>('.grid-body [role="row"]');
  if (!scroller || !row || row.offsetHeight === 0) {
    return 10;
  }
  return Math.max(1, Math.floor(scroller.clientHeight / row.offsetHeight) - 1);
}
