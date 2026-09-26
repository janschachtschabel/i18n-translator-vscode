import type { RowView } from '../../shared/viewModel';
import type { CellRef } from './edits';

/** The cell after (1) or before (-1) `from` in reading order: along its row, then on to the next row. */
export function nextCell(
  rows: readonly RowView[],
  locales: readonly { code: string }[],
  from: CellRef,
  direction: 1 | -1,
): CellRef | undefined {
  const row = rows.findIndex((candidate) => candidate.entryId === from.entryId);
  const column = locales.findIndex((locale) => locale.code === from.locale);
  if (row === -1 || column === -1) {
    return undefined;
  }
  const index = row * locales.length + column + direction;
  if (index < 0 || index >= rows.length * locales.length) {
    return undefined;
  }
  return {
    entryId: rows[Math.floor(index / locales.length)]!.entryId,
    locale: locales[index % locales.length]!.code,
  };
}
