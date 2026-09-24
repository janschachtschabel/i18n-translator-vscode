import type { Bundle } from '../../model/bundle';
import { displayKey, type EntryKey } from '../../model/keys';
import type { LocaleCode } from '../../model/types';
import type { CheckContext, Finding, Rule } from '../types';
import {
  entryIds,
  fileLocation,
  finding,
  isFullLocale,
  isReadable,
  keyLocation,
  readableReference,
} from './support';

interface Completeness {
  missing: { locale: LocaleCode; key: EntryKey }[];
  orphans: { locale: LocaleCode; key: EntryKey }[];
  misplaced: { locale: LocaleCode; key: EntryKey; suggestion: EntryKey }[];
}

/**
 * Compares every readable full locale with the reference. A key only a translation has is an orphan,
 * unless a missing key ends with the same segment: then it is probably misplaced (and reported only as such).
 */
function analyze(bundle: Bundle, ctx: CheckContext): Completeness {
  const result: Completeness = { missing: [], orphans: [], misplaced: [] };
  const reference = readableReference(bundle);
  if (reference === undefined) {
    return result;
  }
  const referenceIds = entryIds(bundle, reference);
  for (const locale of bundle.locales) {
    if (locale === reference || !isFullLocale(ctx, locale) || !isReadable(bundle, locale)) {
      continue;
    }
    const ids = entryIds(bundle, locale);
    const missing = bundle.keys.filter((key) => referenceIds.has(key.id) && !ids.has(key.id));
    result.missing.push(...missing.map((key) => ({ locale, key })));
    for (const key of bundle.keys.filter(
      (candidate) => ids.has(candidate.id) && !referenceIds.has(candidate.id),
    )) {
      const suggestion = likelyTarget(key, missing);
      if (suggestion) {
        result.misplaced.push({ locale, key, suggestion });
      } else {
        result.orphans.push({ locale, key });
      }
    }
  }
  return result;
}

/** The missing key with the same last segment and the longest common segment suffix, if any. */
function likelyTarget(orphan: EntryKey, missing: readonly EntryKey[]): EntryKey | undefined {
  let best: EntryKey | undefined;
  let bestLength = 0;
  for (const candidate of missing) {
    const length = commonSuffixLength(orphan.segments, candidate.segments);
    if (length > bestLength) {
      best = candidate;
      bestLength = length;
    }
  }
  return best;
}

function commonSuffixLength(a: readonly string[], b: readonly string[]): number {
  let length = 0;
  while (length < a.length && length < b.length && a[a.length - 1 - length] === b[b.length - 1 - length]) {
    length++;
  }
  return length;
}

function eachBundle(ctx: CheckContext, map: (bundle: Bundle, result: Completeness) => Finding[]): Finding[] {
  return ctx.bundles.flatMap((bundle) => map(bundle, analyze(bundle, ctx)));
}

export const missingKeyRule: Rule = {
  id: 'missing-key',
  defaultSeverity: 'warning',
  run: (ctx) =>
    eachBundle(ctx, (bundle, { missing }) =>
      missing.map(({ locale, key }) =>
        finding('missing-key', bundle, {
          locale,
          key,
          args: { key: displayKey(key), locale },
          location: fileLocation(bundle, locale),
        }),
      ),
    ),
};

export const orphanKeyRule: Rule = {
  id: 'orphan-key',
  defaultSeverity: 'warning',
  run: (ctx) =>
    eachBundle(ctx, (bundle, { orphans }) =>
      orphans.map(({ locale, key }) =>
        finding('orphan-key', bundle, {
          locale,
          key,
          args: { key: displayKey(key), locale, reference: bundle.reference ?? '' },
          location: keyLocation(bundle, locale, key),
        }),
      ),
    ),
};

export const misplacedKeyRule: Rule = {
  id: 'misplaced-key',
  defaultSeverity: 'warning',
  run: (ctx) =>
    eachBundle(ctx, (bundle, { misplaced }) =>
      misplaced.map(({ locale, key, suggestion }) =>
        finding('misplaced-key', bundle, {
          locale,
          key,
          args: { key: displayKey(key), locale, suggestion: displayKey(suggestion) },
          location: keyLocation(bundle, locale, key),
        }),
      ),
    ),
};
