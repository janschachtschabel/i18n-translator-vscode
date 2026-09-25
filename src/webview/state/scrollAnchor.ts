/** Where a row is: its top edge from the start of the scrolled content, and its height (px). */
export interface RowBox {
  id: string;
  top: number;
  height: number;
}

/** The row to keep in place, and its distance from the top of the view (negative: cut off at the top). */
export interface ScrollAnchor {
  id: string;
  offset: number;
}

/**
 * The row that should stay where it is when the rows change their height, e.g. when a language is hidden: the
 * first row whose top edge, where its key is, is in view; or, if one row fills the whole view, that row.
 * `rows` are in document order.
 */
export function captureAnchor(
  rows: readonly RowBox[],
  view: { top: number; height: number },
): ScrollAnchor | undefined {
  const index = rows.findIndex((row) => row.top + row.height > view.top);
  const covering = rows[index];
  if (!covering) {
    return undefined;
  }
  const next = rows[index + 1];
  const anchor = covering.top < view.top && next && next.top < view.top + view.height ? next : covering;
  return { id: anchor.id, offset: anchor.top - view.top };
}

/** The scroll position that puts the anchor row back at its distance from the top; undefined if it is gone. */
export function anchoredScrollTop(anchor: ScrollAnchor, rows: readonly RowBox[]): number | undefined {
  const row = rows.find((candidate) => candidate.id === anchor.id);
  return row && Math.max(0, row.top - anchor.offset);
}
