import { hasSyntaxError } from '../../formats/adapter';
import type { Bundle } from '../../model/bundle';
import type { EntryKey } from '../../model/keys';
import { VALUE_FIELD, type LocaleCode } from '../../model/types';
import type { CheckContext, Finding, IssueArgs, IssueLocation, RuleId } from '../types';

/** A locale file exists and parses; files with syntax errors take part in no comparison. */
export function isReadable(bundle: Bundle, locale: LocaleCode): boolean {
  const file = bundle.file(locale);
  return file !== undefined && !hasSyntaxError(file.parsed);
}

/** The reference locale if its file parses; bundles without one get no reference-based findings. */
export function readableReference(bundle: Bundle): LocaleCode | undefined {
  return bundle.reference !== undefined && isReadable(bundle, bundle.reference)
    ? bundle.reference
    : undefined;
}

/** Full locales must contain every key; sparse variants only contain what differs from their base. */
export function isFullLocale(ctx: CheckContext, locale: LocaleCode): boolean {
  return !ctx.variants.has(locale);
}

export function entryIds(bundle: Bundle, locale: LocaleCode): Set<string> {
  return new Set(bundle.file(locale)?.parsed.entries.map((entry) => entry.key.id) ?? []);
}

export interface TranslationPair {
  locale: LocaleCode;
  key: EntryKey;
  referenceText: string;
  text: string;
}

/** Every non-blank text of a readable locale next to the non-blank reference text of the same key. */
export function translationPairs(bundle: Bundle): TranslationPair[] {
  const reference = readableReference(bundle);
  if (reference === undefined) {
    return [];
  }
  const pairs: TranslationPair[] = [];
  for (const locale of bundle.locales) {
    if (locale === reference || !isReadable(bundle, locale)) {
      continue;
    }
    for (const key of bundle.keys) {
      const referenceText = bundle.value(key.id, reference);
      const text = bundle.value(key.id, locale);
      if (referenceText?.trim() && text?.trim()) {
        pairs.push({ locale, key, referenceText, text });
      }
    }
  }
  return pairs;
}

export function fileLocation(bundle: Bundle, locale: LocaleCode): IssueLocation | undefined {
  const file = bundle.file(locale);
  return file && { relPath: file.relPath };
}

export function keyLocation(bundle: Bundle, locale: LocaleCode, key: EntryKey): IssueLocation | undefined {
  return entryLocation(bundle, locale, key, 'keyRange');
}

export function valueLocation(bundle: Bundle, locale: LocaleCode, key: EntryKey): IssueLocation | undefined {
  return entryLocation(bundle, locale, key, 'valueRange');
}

function entryLocation(
  bundle: Bundle,
  locale: LocaleCode,
  key: EntryKey,
  range: 'keyRange' | 'valueRange',
): IssueLocation | undefined {
  const file = bundle.file(locale);
  const field = bundle.entry(key.id, locale)?.fields[VALUE_FIELD];
  return file && field && { relPath: file.relPath, range: field[range] };
}

export function finding(
  rule: RuleId,
  bundle: Bundle,
  details: { locale?: LocaleCode; key?: EntryKey; args: IssueArgs; location?: IssueLocation },
): Finding {
  return {
    rule,
    areaId: bundle.areaId,
    bundleId: bundle.id,
    ...(details.locale !== undefined ? { locale: details.locale } : {}),
    ...(details.key ? { entryId: details.key.id } : {}),
    args: details.args,
    ...(details.location ? { location: details.location } : {}),
  };
}
