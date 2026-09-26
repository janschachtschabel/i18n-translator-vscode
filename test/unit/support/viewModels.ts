import type { Severity } from '../../../src/core/checks/types';
import type { CellView, LocaleView, RowView } from '../../../src/shared/viewModel';

/** Builders for view models in tests; without DOM or Node, so both the shared and the webview tests use them. */
export const locale = (code: string, flags: Partial<LocaleView> = {}): LocaleView => ({
  code,
  lang: code.replace(/[-_].*$/, ''),
  reference: false,
  variant: false,
  hasFile: true,
  missing: 0,
  findings: 0,
  issues: [],
  ...flags,
});

type FindingSpec = string | { rule: string; message?: string; severity?: Severity };

/** A cell with a text (undefined: none) and findings, given by rule or in full; warnings unless said otherwise. */
export const text = (value: string | undefined, ...findings: FindingSpec[]): CellView => ({
  value,
  issues: findings.map((finding) => {
    const { rule, message, severity } = typeof finding === 'string' ? { rule: finding } : finding;
    return { rule, severity: severity ?? 'warning', message: message ?? rule };
  }),
});

export const row = (key: string, cells: Record<string, CellView>): RowView => ({
  entryId: JSON.stringify(key.split('.')),
  key,
  cells,
});
