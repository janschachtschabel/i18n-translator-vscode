import type { CellView, RowView } from '../../shared/viewModel';
import type { CellRef, PendingEdit, Rejection } from './edits';

/** A cell as the editor shows it. */
export interface ShownCell extends CellView {
  /** Why the text typed for this cell was not saved. */
  notSaved?: string;
}

export interface ShownRow extends RowView {
  cells: Readonly<Record<string, ShownCell>>;
}

/** The cell of a language without a text. */
export const NO_TEXT: ShownCell = { value: undefined, issues: [] };

/** What editing changed in a cell: a text sent (undefined: cleared), and why a text was not saved. */
interface CellChange {
  sent?: string | undefined;
  notSaved?: string;
}

/**
 * The rows with the texts on their way to the files and the marks of texts that were not saved. A sent text
 * takes the place of its cell, without the findings of the old text, until the model has it. Rows whose cells
 * show nothing new stay the same objects, so that only the changed ones render again.
 */
export function showEdits(
  rows: readonly RowView[],
  pending: readonly PendingEdit[],
  rejected: ReadonlyMap<string, Rejection>,
): readonly ShownRow[] {
  if (pending.length === 0 && rejected.size === 0) {
    return rows;
  }
  const changes = new Map<string, Map<string, CellChange>>();
  const changeOf = (cell: CellRef): CellChange => {
    let row = changes.get(cell.entryId);
    if (!row) {
      row = new Map();
      changes.set(cell.entryId, row);
    }
    let change = row.get(cell.locale);
    if (!change) {
      change = {};
      row.set(cell.locale, change);
    }
    return change;
  };
  for (const edit of pending) {
    // A later text for the same cell replaces an earlier one. Clearing deletes the text (B2): none is left.
    changeOf(edit).sent = edit.value === '' ? undefined : edit.value;
  }
  for (const rejection of rejected.values()) {
    changeOf(rejection).notSaved = rejection.message;
  }
  return rows.map((row) => {
    const cells = changes.get(row.entryId);
    if (!cells) {
      return row;
    }
    let shown: Record<string, ShownCell> | undefined;
    for (const [locale, change] of cells) {
      const cell = row.cells[locale] ?? NO_TEXT;
      const sent = 'sent' in change && change.sent !== cell.value ? { value: change.sent, issues: [] } : cell;
      const next = change.notSaved === undefined ? sent : { ...sent, notSaved: change.notSaved };
      if (next !== row.cells[locale]) {
        shown ??= { ...row.cells };
        shown[locale] = next;
      }
    }
    return shown ? { ...row, cells: shown } : row;
  });
}

/**
 * The rows the filter lets through, and those of `kept` where the model has them, also when the filter no longer
 * lets them through (e.g. once their missing text is there), in the model's order.
 */
export function withRowsOf(
  filtered: readonly RowView[],
  all: readonly RowView[],
  kept: ReadonlySet<string>,
): readonly RowView[] {
  const shown = new Set(filtered.map((row) => row.entryId));
  if ([...kept].every((entryId) => shown.has(entryId))) {
    return filtered;
  }
  return all.filter((row) => shown.has(row.entryId) || kept.has(row.entryId));
}

/** The text in the reference language that a cell's editor checks against; undefined in the reference itself. */
export function referenceTextOf(
  row: ShownRow,
  reference: string | undefined,
  locale: string,
): string | undefined {
  return reference === undefined || locale === reference ? undefined : row.cells[reference]?.value;
}
