import type { Bundle } from '../../model/bundle';
import { BASE_FILE_LOCALE } from '../../model/locale';
import { displayKey, type EntryKey } from '../../model/keys';
import type { LocaleCode } from '../../model/types';
import { hasTextToTranslate } from '../translatable';
import type { CheckContext, Finding, Rule } from '../types';
import {
  entryIds,
  fileLocation,
  finding,
  isFullLocale,
  isOverrideBundle,
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
 * Compares every readable full locale with the keys every language needs: those of the reference, and those of the
 * file without locale (metadatasets, mail templates) that have words to translate: edu-sharing reads that file last
 * for every language, so a language without such a key shows its English text. A key whose text there has none, such
 * as a license link, is right as it falls back. A key only a translation has is an orphan, unless a missing key ends
 * with the same segments: then it is probably misplaced (and reported only as such). An override bundle holds only
 * what it changes and gets none of these findings.
 */
function analyze(bundle: Bundle, ctx: CheckContext): Completeness {
  const result: Completeness = { missing: [], orphans: [], misplaced: [] };
  const reference = readableReference(bundle);
  if (reference === undefined || isOverrideBundle(ctx.area, bundle.name)) {
    return result;
  }
  const referenceIds = entryIds(bundle, reference);
  const base = bundle.locales.includes(BASE_FILE_LOCALE) && isReadable(bundle, BASE_FILE_LOCALE);
  const baseIds = base ? [...entryIds(bundle, BASE_FILE_LOCALE)] : [];
  const translatable = (id: string) =>
    hasTextToTranslate(bundle.value(id, BASE_FILE_LOCALE) ?? '', ctx.area.placeholderSyntax);
  const needed = new Set([...referenceIds, ...baseIds.filter(translatable)]);
  const known = new Set([...referenceIds, ...baseIds]);
  for (const locale of bundle.locales) {
    if (!isFullLocale(ctx, locale) || !isReadable(bundle, locale)) {
      continue;
    }
    const ids = entryIds(bundle, locale);
    const missing = bundle.keys.filter((key) => needed.has(key.id) && !ids.has(key.id));
    result.missing.push(...missing.map((key) => ({ locale, key })));
    if (locale === reference) {
      continue;
    }
    const extra = bundle.keys.filter((key) => ids.has(key.id) && !known.has(key.id));
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
 * More pairs than this among keys with the same last segment get no suggestions; their keys stay orphans. Real
 * files have a few; crafted ones (`A0.X` … `An.X` against `B0.X` … `Bn.X`) would need quadratic time and memory.
 */
const MAX_PAIRS_PER_ENDING = 10_000;

/**
 * Pairs extra keys with missing keys that end in the same segments, the longest common ending first and
 * ties in key order. Each missing key is suggested once, so moving every key as suggested never collides.
 * Keys pair only within their last segment, so each segment is paired on its own.
 */
function likelyTargets(extra: readonly EntryKey[], missing: readonly EntryKey[]): Map<string, EntryKey> {
  const missingByLast = byLastSegment(missing);
  const targets = new Map<string, EntryKey>();
  for (const [last, keys] of byLastSegment(extra)) {
    const candidates = missingByLast.get(last) ?? [];
    if (candidates.length === 0 || keys.length * candidates.length > MAX_PAIRS_PER_ENDING) {
      continue;
    }
    const pairs = keys.flatMap((key, keyIndex) =>
      candidates.map((target, targetIndex) => ({
        key,
        target,
        length: commonSuffixLength(key.segments, target.segments),
        keyIndex,
        targetIndex,
      })),
    );
    pairs.sort((a, b) => b.length - a.length || a.keyIndex - b.keyIndex || a.targetIndex - b.targetIndex);
    const taken = new Set<string>();
    for (const { key, target } of pairs) {
      if (!targets.has(key.id) && !taken.has(target.id)) {
        targets.set(key.id, target);
        taken.add(target.id);
      }
    }
  }
  return targets;
}

/** The keys by their last segment, each group in key order. */
function byLastSegment(keys: readonly EntryKey[]): Map<string, EntryKey[]> {
  const groups = new Map<string, EntryKey[]>();
  for (const key of keys) {
    const last = key.segments[key.segments.length - 1]!;
    const group = groups.get(last);
    if (group) {
      group.push(key);
    } else {
      groups.set(last, [key]);
    }
  }
  return groups;
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
