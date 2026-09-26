import { riskyPattern } from '../config/riskyPattern';
import type { LocaleCode } from '../model/types';

/** A sparse locale that only contains texts that differ from its base (e.g. `de-informal` → `de`). */
export interface VariantConfig {
  /** Locale the variant derives from; missing keys fall back to it at runtime. */
  base: LocaleCode;
  /** Regular expression: when it matches the base text, the variant needs its own text. */
  requiredWhen: string;
  /** Regular expression: text the variant itself should not contain. */
  forbidden?: string;
}

export type VariantSettings = Readonly<Record<LocaleCode, VariantConfig>>;

export interface CompiledVariant {
  locale: LocaleCode;
  base: LocaleCode;
  /** Non-global, so `test`/`exec` carry no state between calls. Undefined if the expression is invalid. */
  required?: RegExp;
  forbidden?: RegExp;
}

const FORMAL_ADDRESS = '\\b(?:Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\\b';
// Only the exact token is replaced at runtime; placeholder-malformed reports other spellings.
const GENDER_MARKER = '\\{\\{GENDER_SEPARATOR\\}\\}';

/** The variants of the edu-sharing frontend (translations.service.ts: de-informal, de-no-binnen-i). */
export const DEFAULT_VARIANTS: VariantSettings = {
  'de-informal': { base: 'de', requiredWhen: FORMAL_ADDRESS, forbidden: FORMAL_ADDRESS },
  'de-no-binnen-i': {
    base: 'de',
    requiredWhen: `${GENDER_MARKER}|[*:_]innen\\b|[a-zäöüß]Innen\\b`,
    forbidden: GENDER_MARKER,
  },
};

/**
 * Compiles variant settings. An invalid expression, or one that could take exponential time, is reported and only
 * its check is skipped: the locale stays a sparse variant, or every key it leaves to its base would count as
 * missing.
 */
export function compileVariants(settings: VariantSettings): {
  variants: Map<LocaleCode, CompiledVariant>;
  errors: string[];
} {
  const variants = new Map<LocaleCode, CompiledVariant>();
  const errors: string[] = [];
  const compile = (locale: LocaleCode, source: string | undefined): RegExp | undefined => {
    if (!source) {
      return undefined;
    }
    let regex: RegExp;
    try {
      regex = new RegExp(source);
    } catch (error) {
      errors.push(`Variant ${locale}: ${(error as Error).message}`);
      return undefined;
    }
    const risk = riskyPattern(source);
    if (risk) {
      errors.push(`Variant ${locale}: "${source}" is refused: ${risk}.`);
      return undefined;
    }
    return regex;
  };
  for (const [locale, config] of Object.entries(settings)) {
    const required = compile(locale, config.requiredWhen);
    const forbidden = compile(locale, config.forbidden);
    variants.set(locale, {
      locale,
      base: config.base,
      ...(required ? { required } : {}),
      ...(forbidden ? { forbidden } : {}),
    });
  }
  return { variants, errors };
}
