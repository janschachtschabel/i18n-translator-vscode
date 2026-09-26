import type { BundleViewModel, IssueView, LocaleView, RowView } from './viewModel';

/**
 * What changed between two models of a bundle. The host sends it instead of the whole model once the webview
 * has one: a change of one text is one row, and the rows the webview keeps render nothing again.
 */
export interface BundlePatch {
  /** The rows that are new or changed. */
  rows: RowView[];
  /** The ids of all rows in their order; only when keys came, went or moved. */
  order?: string[];
  locales?: LocaleView[];
  issues?: IssueView[];
}

/** The patch from one model of a bundle to the next; undefined when nothing changed. */
export function diffModels(before: BundleViewModel, after: BundleViewModel): BundlePatch | undefined {
  const old = new Map(before.rows.map((row) => [row.entryId, row]));
  const patch: BundlePatch = { rows: after.rows.filter((row) => !sameJson(old.get(row.entryId), row)) };
  const sameOrder =
    before.rows.length === after.rows.length &&
    after.rows.every((row, index) => row.entryId === before.rows[index]!.entryId);
  if (!sameOrder) {
    patch.order = after.rows.map((row) => row.entryId);
  }
  if (!sameJson(before.locales, after.locales)) {
    patch.locales = after.locales;
  }
  if (!sameJson(before.issues, after.issues)) {
    patch.issues = after.issues;
  }
  const empty = patch.rows.length === 0 && !patch.order && !patch.locales && !patch.issues;
  return empty ? undefined : patch;
}

/** The model after a patch; the rows the patch does not bring are the same objects as before. */
export function applyPatch(model: BundleViewModel, patch: BundlePatch): BundleViewModel {
  const rows = new Map(model.rows.map((row) => [row.entryId, row]));
  for (const row of patch.rows) {
    rows.set(row.entryId, row);
  }
  const order = patch.order ?? model.rows.map((row) => row.entryId);
  return {
    ...model,
    rows: order.flatMap((id) => rows.get(id) ?? []),
    locales: patch.locales ?? model.locales,
    issues: patch.issues ?? model.issues,
  };
}

/** Both models are built by the same code from plain data, so their JSON has the same key order. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
