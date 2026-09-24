import { hasSyntaxError } from '../formats/adapter';
import type { Issue, Severity } from '../checks/types';
import type { Bundle } from '../model/bundle';
import type { LocaleCode } from '../model/types';

export type SeverityCounts = Record<Severity, number>;

export interface LocaleSummary {
  locale: LocaleCode;
  /** Entries of the locale file; undefined if the bundle has no file for the locale. */
  keys?: number;
  counts: SeverityCounts;
}

export interface BundleSummary {
  /** Entries of the reference file, or of all locales together if the reference cannot be read. */
  keys: number;
  counts: SeverityCounts;
  /** The locales with a file (reference first), then locales that only have findings (e.g. a missing file). */
  locales: LocaleSummary[];
}

export function countBySeverity(issues: readonly Issue[]): SeverityCounts {
  const counts: SeverityCounts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    counts[issue.severity]++;
  }
  return counts;
}

/** Keys and findings of a bundle, in total and per locale; `issues` may contain other bundles' findings. */
export function summarizeBundle(bundle: Bundle, issues: readonly Issue[]): BundleSummary {
  const own = issues.filter((issue) => issue.bundleId === bundle.id);
  const withoutFile = [...new Set(own.map((issue) => issue.locale))]
    .filter((locale): locale is LocaleCode => locale !== undefined && !bundle.locales.includes(locale))
    .sort();
  const reference = bundle.reference !== undefined ? bundle.file(bundle.reference) : undefined;
  return {
    keys:
      reference && !hasSyntaxError(reference.parsed) ? reference.parsed.entries.length : bundle.keys.length,
    counts: countBySeverity(own),
    locales: [...bundle.locales, ...withoutFile].map((locale) => {
      const file = bundle.file(locale);
      return {
        locale,
        ...(file ? { keys: file.parsed.entries.length } : {}),
        counts: countBySeverity(own.filter((issue) => issue.locale === locale)),
      };
    }),
  };
}
