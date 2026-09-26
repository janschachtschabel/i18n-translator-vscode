import type { Issue, RuleId } from '../checks/types';
import type { Bundle } from '../model/bundle';
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

function isEnglish(code: string): boolean {
  return code === 'en' || code.startsWith('en_') || code.startsWith('en-') || code === 'default';
}
