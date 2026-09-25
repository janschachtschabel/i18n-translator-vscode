import { ISSUE_MESSAGES, type MessageText } from '../core/checks/messages';
import type { Issue, Severity } from '../core/checks/types';
import type { Bundle } from '../core/model/bundle';
import { displayKey } from '../core/model/keys';
import { languageTag, parseLocale } from '../core/model/locale';

/** A finding as the editor shows it: its message already in the user's language. */
export interface IssueView {
  rule: string;
  severity: Severity;
  message: string;
}

export interface LocaleView {
  code: string;
  /** BCP 47 tag for the `lang` of its texts, so that screen readers pick the right voice; undefined if none. */
  lang?: string;
  reference: boolean;
  /** A sparse variant (e.g. `de-informal`): missing texts fall back to its base language. */
  variant: boolean;
  hasFile: boolean;
  /** Keys this language lacks (missing-key findings). */
  missing: number;
  /** Every finding in this language. */
  findings: number;
  /**
   * Findings that belong to no cell: about the file itself (missing, unreadable), or about a key that is not a
   * text in any language (an object defined twice, a number), which therefore has no row.
   */
  issues: IssueView[];
}

export interface CellView {
  /** undefined: the language has no text for the key (as opposed to an empty text). */
  value: string | undefined;
  issues: IssueView[];
}

export interface RowView {
  entryId: string;
  /** The dotted key, for display only. */
  key: string;
  /** One cell per language of {@link BundleViewModel.locales}. */
  cells: Readonly<Record<string, CellView>>;
}

/** Everything the editor needs to show a bundle; built by the host, sent to the webview. */
export interface BundleViewModel {
  bundleId: string;
  name: string;
  locales: LocaleView[];
  rows: RowView[];
  /** Findings about the bundle as a whole, without a language. */
  issues: IssueView[];
}

export interface ViewModelOptions {
  /** Findings of the root; those of other bundles are left out. */
  issues: readonly Issue[];
  /** Codes of the sparse variants. */
  variants: readonly string[];
  /** Language of the base file (`default`), for its language tag. */
  baseFileLanguage: string;
  /** Turns a message template into the user's language (vscode.l10n in the host, formatMessage in tests). */
  localize: (message: MessageText) => string;
}

/**
 * The view of a bundle: its languages (those with a file, then those only findings point to, e.g. a missing
 * file or a variant a key needs) and one row per key with a cell per language and the findings in each cell.
 */
export function buildBundleViewModel(bundle: Bundle, options: ViewModelOptions): BundleViewModel {
  const issues = options.issues.filter((issue) => issue.bundleId === bundle.id);
  const view = (issue: Issue): IssueView => ({
    rule: issue.rule,
    severity: issue.severity,
    message: options.localize({ template: ISSUE_MESSAGES[issue.rule], args: issue.args }),
  });
  const pointedTo = issues.flatMap((issue) => (issue.locale !== undefined ? [issue.locale] : []));
  const extra = [...new Set(pointedTo)].filter((code) => !bundle.locales.includes(code)).sort();
  const codes = [...bundle.locales, ...extra];

  const rowIds = new Set(bundle.keys.map((key) => key.id));
  const inCell = (issue: Issue) =>
    issue.locale !== undefined && issue.entryId !== undefined && rowIds.has(issue.entryId);
  const cellIssues = new Map<string, IssueView[]>();
  for (const issue of issues.filter(inCell)) {
    const cell = cellId(issue.entryId!, issue.locale!);
    cellIssues.set(cell, [...(cellIssues.get(cell) ?? []), view(issue)]);
  }

  return {
    bundleId: bundle.id,
    name: bundle.name,
    locales: codes.map((code) => {
      const inLocale = issues.filter((issue) => issue.locale === code);
      const lang = languageTag(parseLocale(code, { baseFileLanguage: options.baseFileLanguage }));
      return {
        code,
        ...(lang !== undefined ? { lang } : {}),
        reference: code === bundle.reference,
        variant: options.variants.includes(code),
        hasFile: bundle.file(code) !== undefined,
        missing: inLocale.filter((issue) => issue.rule === 'missing-key').length,
        findings: inLocale.length,
        issues: inLocale.filter((issue) => !inCell(issue)).map(view),
      };
    }),
    rows: bundle.keys.map((key) => ({
      entryId: key.id,
      key: displayKey(key),
      cells: Object.fromEntries(
        codes.map((code) => [
          code,
          { value: bundle.value(key.id, code), issues: cellIssues.get(cellId(key.id, code)) ?? [] },
        ]),
      ),
    })),
    issues: issues.filter((issue) => issue.locale === undefined).map(view),
  };
}

function cellId(entryId: string, locale: string): string {
  return JSON.stringify([entryId, locale]);
}
