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
  /** Non-global, so `test`/`exec` carry no state between calls. */
  required: RegExp;
  forbidden?: RegExp;
}

const FORMAL_ADDRESS = '\\b(?:Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\\b';
const GENDER_MARKER = '\\{\\{\\s*GENDER_SEPARATOR\\s*\\}\\}';

/** The variants of the edu-sharing frontend (translations.service.ts: de-informal, de-no-binnen-i). */
export const DEFAULT_VARIANTS: VariantSettings = {
  'de-informal': { base: 'de', requiredWhen: FORMAL_ADDRESS, forbidden: FORMAL_ADDRESS },
  'de-no-binnen-i': {
    base: 'de',
    requiredWhen: `${GENDER_MARKER}|[*:_]innen\\b|[a-zäöüß]Innen\\b`,
    forbidden: GENDER_MARKER,
  },
};

/** Compiles variant settings; invalid entries are skipped and reported, so one typo does not stop all checks. */
export function compileVariants(settings: VariantSettings): {
  variants: Map<LocaleCode, CompiledVariant>;
  errors: string[];
} {
  const variants = new Map<LocaleCode, CompiledVariant>();
  const errors: string[] = [];
  for (const [locale, config] of Object.entries(settings)) {
    try {
      variants.set(locale, {
        locale,
        base: config.base,
        required: new RegExp(config.requiredWhen),
        ...(config.forbidden ? { forbidden: new RegExp(config.forbidden) } : {}),
      });
    } catch (error) {
      errors.push(`Variant ${locale}: ${(error as Error).message}`);
    }
  }
  return { variants, errors };
}
