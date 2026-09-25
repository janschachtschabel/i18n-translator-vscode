import { describe, expect, it } from 'vitest';
import { moveInGrid, type GridSize } from '../../../src/webview/a11y/gridKeys';

// A header row and 20 rows; the key column and 4 languages; 5 rows per page.
const size: GridSize = { rows: 21, columns: 5, page: 5 };
const press = (
  key: string,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('moveInGrid', () => {
  it('moves one cell with the arrow keys and stops at the edges', () => {
    const from = { row: 3, column: 2 };
    expect(moveInGrid(from, press('ArrowUp'), size)).toEqual({ row: 2, column: 2 });
    expect(moveInGrid(from, press('ArrowDown'), size)).toEqual({ row: 4, column: 2 });
    expect(moveInGrid(from, press('ArrowLeft'), size)).toEqual({ row: 3, column: 1 });
    expect(moveInGrid(from, press('ArrowRight'), size)).toEqual({ row: 3, column: 3 });
    expect(moveInGrid({ row: 0, column: 0 }, press('ArrowUp'), size)).toEqual({ row: 0, column: 0 });
    expect(moveInGrid({ row: 0, column: 0 }, press('ArrowLeft'), size)).toEqual({ row: 0, column: 0 });
    expect(moveInGrid({ row: 20, column: 4 }, press('ArrowDown'), size)).toEqual({ row: 20, column: 4 });
    expect(moveInGrid({ row: 20, column: 4 }, press('ArrowRight'), size)).toEqual({ row: 20, column: 4 });
  });

  it('goes to the first or last cell of the row with Home and End', () => {
    expect(moveInGrid({ row: 3, column: 2 }, press('Home'), size)).toEqual({ row: 3, column: 0 });
    expect(moveInGrid({ row: 3, column: 2 }, press('End'), size)).toEqual({ row: 3, column: 4 });
  });

  it('goes to the first or last cell of the grid with Ctrl+Home and Ctrl+End (Cmd on macOS)', () => {
    expect(moveInGrid({ row: 3, column: 2 }, press('Home', { ctrlKey: true }), size)).toEqual({
      row: 0,
      column: 0,
    });
    expect(moveInGrid({ row: 3, column: 2 }, press('End', { ctrlKey: true }), size)).toEqual({
      row: 20,
      column: 4,
    });
    expect(moveInGrid({ row: 3, column: 2 }, press('End', { metaKey: true }), size)).toEqual({
      row: 20,
      column: 4,
    });
  });

  it('moves a page with Page Up and Page Down and stops at the first and last row', () => {
    expect(moveInGrid({ row: 3, column: 2 }, press('PageDown'), size)).toEqual({ row: 8, column: 2 });
    expect(moveInGrid({ row: 18, column: 2 }, press('PageDown'), size)).toEqual({ row: 20, column: 2 });
    expect(moveInGrid({ row: 8, column: 2 }, press('PageUp'), size)).toEqual({ row: 3, column: 2 });
    expect(moveInGrid({ row: 3, column: 2 }, press('PageUp'), size)).toEqual({ row: 0, column: 2 });
  });

  it('leaves other keys and modified arrows to others', () => {
    const from = { row: 3, column: 2 };
    expect(moveInGrid(from, press('Enter'), size)).toBeUndefined();
    expect(moveInGrid(from, press('a'), size)).toBeUndefined();
    // Alt+↓/↑ go to the next open point (design §7.2), Shift+arrows may select.
    expect(moveInGrid(from, press('ArrowDown', { altKey: true }), size)).toBeUndefined();
    expect(moveInGrid(from, press('ArrowDown', { shiftKey: true }), size)).toBeUndefined();
    expect(moveInGrid(from, press('ArrowDown', { ctrlKey: true }), size)).toBeUndefined();
  });
});
