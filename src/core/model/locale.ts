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
 * An exact code match wins; variants never become the reference.
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
  const candidates = codes
    .map((code) => parseLocale(code, opts))
    .filter((info) => info.language === wanted && !info.variant);
  // A plain or regional locale is a better reference than the base file that happens to share the language.
  return (candidates.find((info) => !info.isBaseFile) ?? candidates[0])?.code;
}
