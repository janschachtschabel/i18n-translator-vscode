/** A cell of the grid: row 0 is the header row, column 0 the key column. */
export interface GridPosition {
  row: number;
  column: number;
}

/** Rows and columns including the header row and the key column; `page`: rows Page Up/Down moves. */
export interface GridSize {
  rows: number;
  columns: number;
  page: number;
}

export type GridKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/**
 * The cell a key moves the focus to, as in the data grid of the ARIA Authoring Practices: arrows, Home/End in
 * the row, Ctrl+Home/End (Cmd on macOS) in the grid, Page Up/Down. The focus stops at the edges. Undefined: the
 * key is not for moving; Alt and Shift with an arrow are left to other commands.
 */
export function moveInGrid(from: GridPosition, event: GridKey, size: GridSize): GridPosition | undefined {
  if (event.altKey || event.shiftKey) {
    return undefined;
  }
  const command = event.ctrlKey || event.metaKey;
  const lastRow = size.rows - 1;
  const lastColumn = size.columns - 1;
  const at = (row: number, column: number): GridPosition => ({
    row: Math.min(Math.max(row, 0), lastRow),
    column: Math.min(Math.max(column, 0), lastColumn),
  });
  switch (event.key) {
    case 'Home':
      return command ? at(0, 0) : at(from.row, 0);
    case 'End':
      return command ? at(lastRow, lastColumn) : at(from.row, lastColumn);
  }
  if (command) {
    return undefined;
  }
  switch (event.key) {
    case 'ArrowUp':
      return at(from.row - 1, from.column);
    case 'ArrowDown':
      return at(from.row + 1, from.column);
    case 'ArrowLeft':
      return at(from.row, from.column - 1);
    case 'ArrowRight':
      return at(from.row, from.column + 1);
    case 'PageUp':
      return at(from.row - size.page, from.column);
    case 'PageDown':
      return at(from.row + size.page, from.column);
    default:
      return undefined;
  }
}
