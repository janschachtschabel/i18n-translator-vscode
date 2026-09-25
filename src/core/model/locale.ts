import type { LocaleCode } from './types';

/** Locale code used for files without a locale suffix (`templates.xml`, `mds.properties`). */
export const BASE_FILE_LOCALE: LocaleCode = 'default';

export interface LocaleInfo {
  code: LocaleCode;
  /** Lower-case language subtag; for the base file the configured base file language. */
  language: string;
  /** Upper-case region, from `de_DE` or `pt-BR`. */
  region?: string;
  /** Variant subtag, from `de-informal` or `de-no-binnen-i`. */
  variant?: string;
  isBaseFile: boolean;
}

export interface LocaleOptions {
  /** Language of the base file, e.g. `en` for edu-sharing's `templates.xml` and `mds.properties`. */
  baseFileLanguage: string;
}

export function parseLocale(code: LocaleCode, opts: LocaleOptions): LocaleInfo {
  if (code === BASE_FILE_LOCALE) {
    return { code, language: opts.baseFileLanguage.toLowerCase(), isBaseFile: true };
  }
  const regional = /^([a-z]{2,3})[_-]([A-Z]{2})$/.exec(code);
  if (regional) {
    return { code, language: regional[1]!, region: regional[2]!, isBaseFile: false };
  }
  const variant = /^([a-z]{2,3})-(.+)$/.exec(code);
  if (variant) {
    return { code, language: variant[1]!, variant: variant[2]!, isBaseFile: false };
  }
  return { code, language: code.toLowerCase(), isBaseFile: false };
}

/**
 * Picks the locale that serves as reference for `referenceLanguage` (`de` matches `de` and `de_DE`).
 * An exact code match wins; variants never become the reference. Among regional locales the main
 * region of the language (`de_DE`) comes first, then code order; the base file comes last. The result
 * does not depend on the order of `codes`.
 */
export function pickReference(
  codes: readonly LocaleCode[],
  referenceLanguage: string,
  opts: LocaleOptions,
): LocaleCode | undefined {
  if (codes.includes(referenceLanguage)) {
    return parseLocale(referenceLanguage, opts).variant ? undefined : referenceLanguage;
  }
  const wanted = referenceLanguage.toLowerCase();
  const rank = (info: LocaleInfo): number =>
    info.isBaseFile ? 2 : info.region === wanted.toUpperCase() ? 0 : 1;
  return codes
    .map((code) => parseLocale(code, opts))
    .filter((info) => info.language === wanted && !info.variant)
    .sort((a, b) => rank(a) - rank(b) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))[0]?.code;
}

/**
 * The BCP 47 tag of a locale, for the `lang` of its texts: language and region (`de_DE` → `de-DE`); only the
 * language for a variant, whose subtag is not registered; undefined if the code names no language.
 */
export function languageTag(info: LocaleInfo): string | undefined {
  if (!/^[a-z]{2,3}$/.test(info.language)) {
    return undefined;
  }
  return info.region ? `${info.language}-${info.region}` : info.language;
}
