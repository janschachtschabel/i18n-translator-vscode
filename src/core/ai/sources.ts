import type { Issue, RuleId } from '../checks/types';
import type { Bundle } from '../model/bundle';
import { displayKey, keyFromId } from '../model/keys';
import type { LocaleCode } from '../model/types';

/** Other languages that go along with a text as context, by default. */
const MAX_CONTEXT = 3;

/**
 * The language a text of `locale` is translated from: the base of a variant (e.g. `de` for `de-no-binnen-i`), if the
 * bundle has it, else the reference; undefined for the reference itself, which has nothing to translate from.
 */
export function sourceLocale(
  bundle: Bundle,
  locale: LocaleCode,
  variants: Readonly<Record<LocaleCode, { base: LocaleCode }>>,
): LocaleCode | undefined {
  const base = variants[locale]?.base;
  const source = base !== undefined && bundle.locales.includes(base) ? base : bundle.reference;
  return source === locale ? undefined : source;
}

/** Texts of the key in other languages, the English ones first, which help most with the meaning. */
export function contextTexts(
  bundle: Bundle,
  entryId: string,
  skip: readonly LocaleCode[],
  max = MAX_CONTEXT,
): Record<string, string> {
  const others = bundle.locales
    .filter((code) => !skip.includes(code))
    .sort((a, b) => Number(!isEnglish(a)) - Number(!isEnglish(b)));
  const context: Record<string, string> = {};
  for (const code of others) {
    const text = bundle.value(entryId, code);
    if (text?.trim() && Object.keys(context).length < max) {
      context[code] = text;
    }
  }
  return context;
}

/** What "Fill with AI" fills, as the findings name it: the same counts as the language's chips. */
export type FillScope = 'missing' | 'empty' | 'variant-needed';

const RULES: Readonly<Record<FillScope, RuleId>> = {
  missing: 'missing-key',
  empty: 'empty-value',
  'variant-needed': 'variant-needed',
};

/**
 * The entries of `bundle` that `scopes` fill in `locale`, in the order of the bundle's keys, each with the text it
 * has now (null: none), against which the texts are written (B5). Entries without a text in `source` are left out:
 * there is nothing to translate from.
 */
export function fillEntries(
  bundle: Bundle,
  issues: readonly Issue[],
  locale: LocaleCode,
  scopes: readonly FillScope[],
  source: LocaleCode,
): { entryId: string; before: string | null }[] {
  const rules = new Set(scopes.map((scope) => RULES[scope]));
  const named = new Set(
    issues
      .filter((issue) => issue.bundleId === bundle.id && issue.locale === locale && rules.has(issue.rule))
      .flatMap((issue) => (issue.entryId === undefined ? [] : [issue.entryId])),
  );
  return bundle.keys
    .filter((key) => named.has(key.id) && Boolean(bundle.value(key.id, source)?.trim()))
    .map((key) => ({ entryId: key.id, before: bundle.value(key.id, locale) ?? null }));
}

/**
 * The texts the AI check looks at in `locale`, in the order of the bundle's keys: those the language has (for a
 * variant: its own), where `source` has a text to check against. Each with its text, which a correction is written
 * against (B5).
 */
export function checkEntries(
  bundle: Bundle,
  locale: LocaleCode,
  source: LocaleCode,
): { entryId: string; before: string }[] {
  return bundle.keys.flatMap((key) => {
    const text = bundle.value(key.id, locale);
    return text?.trim() && bundle.value(key.id, source)?.trim() ? [{ entryId: key.id, before: text }] : [];
  });
}

function isEnglish(code: string): boolean {
  return code === 'en' || code.startsWith('en_') || code.startsWith('en-') || code === 'default';
}

/**
 * The key of each entry as the model sees it: as the editor shows it, which relates it to the other texts, and unique
 * within the job, as the answers come back by key (K2). Keys shown alike, such as ["A", "B"] and ["A.B"], get a number.
 */
export function promptKeys(entryIds: readonly string[]): string[] {
  const used = new Set<string>();
  return entryIds.map((entryId) => {
    const shown = displayKey(keyFromId(entryId));
    let key = shown;
    for (let number = 2; used.has(key); number++) {
      key = `${shown} (${number})`;
    }
    used.add(key);
    return key;
  });
}
