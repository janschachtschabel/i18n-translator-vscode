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
 * unless a missing key ends with the same segments: then it is probably misplaced (and reported only as such).
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
    const extra = bundle.keys.filter((key) => ids.has(key.id) && !referenceIds.has(key.id));
    result.missing.push(...missing.map((key) => ({ locale, key })));
    const targets = likelyTargets(extra, missing);
    for (const key of extra) {
      const suggestion = targets.get(key.id);
      if (suggestion) {
        result.misplaced.push({ locale, key, suggestion });
      } else {
        result.orphans.push({ locale, key });
      }
    }
  }
  return result;
}

/**
 * Pairs extra keys with missing keys that end in the same segments, the longest common ending first and
 * ties in key order. Each missing key is suggested once, so moving every key as suggested never collides.
 */
function likelyTargets(extra: readonly EntryKey[], missing: readonly EntryKey[]): Map<string, EntryKey> {
  const missingByLast = new Map<string, EntryKey[]>();
  for (const key of missing) {
    const group = missingByLast.get(lastSegment(key));
    if (group) {
      group.push(key);
    } else {
      missingByLast.set(lastSegment(key), [key]);
    }
  }
  const pairs = extra.flatMap((key, keyIndex) =>
    (missingByLast.get(lastSegment(key)) ?? []).map((target, targetIndex) => ({
      key,
      target,
      length: commonSuffixLength(key.segments, target.segments),
      keyIndex,
      targetIndex,
    })),
  );
  pairs.sort((a, b) => b.length - a.length || a.keyIndex - b.keyIndex || a.targetIndex - b.targetIndex);
  const targets = new Map<string, EntryKey>();
  const taken = new Set<string>();
  for (const { key, target } of pairs) {
    if (!targets.has(key.id) && !taken.has(target.id)) {
      targets.set(key.id, target);
      taken.add(target.id);
    }
  }
  return targets;
}

function lastSegment(key: EntryKey): string {
  return key.segments[key.segments.length - 1]!;
}

function commonSuffixLength(a: readonly string[], b: readonly string[]): number {
  let length = 0;
  while (length < a.length && length < b.length && a[a.length - 1 - length] === b[b.length - 1 - length]) {
    length++;
  }
  return length;
}

// The three rules share one analysis per bundle; a context lives for one runChecks call.
const analyses = new WeakMap<CheckContext, Map<Bundle, Completeness>>();

function eachBundle(ctx: CheckContext, map: (bundle: Bundle, result: Completeness) => Finding[]): Finding[] {
  let cache = analyses.get(ctx);
  if (!cache) {
    cache = new Map();
    analyses.set(ctx, cache);
  }
  return ctx.bundles.flatMap((bundle) => {
    let result = cache.get(bundle);
    if (!result) {
      result = analyze(bundle, ctx);
      cache.set(bundle, result);
    }
    return map(bundle, result);
  });
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
