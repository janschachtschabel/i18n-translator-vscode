import type { AreaDefinition } from '../area/areaDefinition';
import { parseAreaDefinition } from '../area/parseArea';
import { PRESETS } from '../area/presets';
import { RULE_IDS, type RuleId, type SeverityOverrides } from '../checks/types';
import { DEFAULT_VARIANTS, type VariantConfig, type VariantSettings } from '../checks/variants';

export type MissingDiagnostics = 'aggregate' | 'individual' | 'off';

/** Validated `eduI18n.*` settings. */
export interface Settings {
  /** Presets (possibly replaced by a custom area with the same id), then custom areas. */
  areas: AreaDefinition[];
  /** Fixed roots per area id; areas without an entry are detected. */
  roots: Readonly<Record<string, string[]>>;
  exclude: string[];
  referenceLanguage: string;
  baseFileLanguage: string;
  variants: VariantSettings;
  severityOverrides: SeverityOverrides;
  ignoreSameAsReference: string[];
  missingDiagnostics: MissingDiagnostics;
}

/** Raw values of the `eduI18n.*` settings, keyed without the prefix (e.g. `checks.severity`). */
export type RawSettings = Readonly<Record<string, unknown>>;

export const DEFAULT_SETTINGS: Settings = {
  areas: [...PRESETS],
  roots: {},
  exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/out/**', '**/target/**', '**/build/**'],
  referenceLanguage: 'de',
  baseFileLanguage: 'en',
  variants: DEFAULT_VARIANTS,
  severityOverrides: {},
  ignoreSameAsReference: ['OK', 'E-Mail', 'CC-0', 'ID'],
  missingDiagnostics: 'aggregate',
};

const SEVERITY_VALUES = ['error', 'warning', 'info', 'off'] as const;
const MISSING_DIAGNOSTICS: readonly MissingDiagnostics[] = ['aggregate', 'individual', 'off'];

/** Validates user settings; invalid values fall back to the default and are reported, never thrown. */
export function parseSettings(raw: RawSettings): { settings: Settings; errors: string[] } {
  const errors: string[] = [];
  const pick = <T>(key: string, valid: (value: unknown) => boolean, fallback: T): T => {
    const value = raw[key];
    if (value === undefined) {
      return fallback;
    }
    if (valid(value)) {
      return value as T;
    }
    errors.push(`eduI18n.${key} has an invalid value; the default is used.`);
    return fallback;
  };

  const settings: Settings = {
    areas: parseAreas(raw['areas'], errors),
    roots: pick('roots', isRootsMap, DEFAULT_SETTINGS.roots),
    exclude: pick('exclude', isStringArray, DEFAULT_SETTINGS.exclude),
    referenceLanguage: pick('referenceLanguage', isNonEmptyString, DEFAULT_SETTINGS.referenceLanguage),
    baseFileLanguage: pick('baseFileLanguage', isNonEmptyString, DEFAULT_SETTINGS.baseFileLanguage),
    variants: parseVariants(raw['variants'], errors),
    severityOverrides: parseSeverities(raw['checks.severity'], errors),
    ignoreSameAsReference: pick(
      'checks.ignoreSameAsReference',
      isStringArray,
      DEFAULT_SETTINGS.ignoreSameAsReference,
    ),
    missingDiagnostics: pick(
      'diagnostics.missing',
      (value) => MISSING_DIAGNOSTICS.includes(value as MissingDiagnostics),
      DEFAULT_SETTINGS.missingDiagnostics,
    ),
  };
  return { settings, errors };
}

function parseAreas(value: unknown, errors: string[]): AreaDefinition[] {
  if (value === undefined) {
    return [...PRESETS];
  }
  if (!Array.isArray(value)) {
    errors.push('eduI18n.areas must be a list of area definitions.');
    return [...PRESETS];
  }
  const custom: AreaDefinition[] = [];
  value.forEach((item, index) => {
    const result = parseAreaDefinition(item);
    if (!result.ok) {
      errors.push(...result.errors.map((message) => `eduI18n.areas[${index}]: ${message}`));
    } else if (custom.some((area) => area.id === result.area.id)) {
      errors.push(`eduI18n.areas[${index}]: the id "${result.area.id}" is used twice.`);
    } else {
      custom.push(result.area);
    }
  });
  return [
    ...PRESETS.map((preset) => custom.find((area) => area.id === preset.id) ?? preset),
    ...custom.filter((area) => !PRESETS.some((preset) => preset.id === area.id)),
  ];
}

function parseSeverities(value: unknown, errors: string[]): SeverityOverrides {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    errors.push('eduI18n.checks.severity must map rule ids to error, warning, info or off.');
    return {};
  }
  const overrides: SeverityOverrides = {};
  for (const [rule, severity] of Object.entries(value)) {
    if (!RULE_IDS.includes(rule as RuleId)) {
      errors.push(`eduI18n.checks.severity: unknown rule "${rule}".`);
    } else if (!SEVERITY_VALUES.includes(severity as (typeof SEVERITY_VALUES)[number])) {
      errors.push(`eduI18n.checks.severity: "${rule}" must be one of ${SEVERITY_VALUES.join(', ')}.`);
    } else {
      overrides[rule as RuleId] = severity as (typeof SEVERITY_VALUES)[number];
    }
  }
  return overrides;
}

function parseVariants(value: unknown, errors: string[]): VariantSettings {
  if (value === undefined) {
    return DEFAULT_VARIANTS;
  }
  if (!isRecord(value)) {
    errors.push('eduI18n.variants must map locale codes to variant definitions.');
    return DEFAULT_VARIANTS;
  }
  const variants: Record<string, VariantConfig> = {};
  for (const [locale, config] of Object.entries(value)) {
    if (
      isRecord(config) &&
      isNonEmptyString(config.base) &&
      isNonEmptyString(config.requiredWhen) &&
      (config.forbidden === undefined || typeof config.forbidden === 'string')
    ) {
      variants[locale] = config as unknown as VariantConfig;
    } else {
      errors.push(
        `eduI18n.variants.${locale} needs "base" and "requiredWhen" (and optionally "forbidden") as text.`,
      );
    }
  }
  return variants;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRootsMap(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isStringArray);
}
