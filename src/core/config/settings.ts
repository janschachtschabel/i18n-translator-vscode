import type { AreaDefinition } from '../area/areaDefinition';
import { parseAreaDefinition } from '../area/parseArea';
import { PRESETS } from '../area/presets';
import { normalizeRoot } from '../area/rootPath';
import { RULE_IDS, type RuleId, type SeverityOverrides } from '../checks/types';
import {
  compileVariants,
  DEFAULT_VARIANTS,
  type VariantConfig,
  type VariantSettings,
} from '../checks/variants';
import type { AnalysisOptions } from '../pipeline/analyze';

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

/** Validated `eduI18n.backup.*` settings. Unlike {@link Settings}, they apply to the window, not to a folder. */
export interface BackupSettings {
  /** Minutes after which the next write backs up the translation files again; 0 turns this off. */
  intervalMinutes: number;
  /** Backups to keep. */
  keep: number;
}

/** Raw values of the `eduI18n.*` settings, keyed without the prefix (e.g. `checks.severity`). */
export type RawSettings = Readonly<Record<string, unknown>>;

/**
 * Every setting {@link parseSettings} reads, per workspace folder (scope `resource` in the manifest). The
 * manifest declares exactly these and {@link BACKUP_SETTING_KEYS} (checked by a test).
 */
export const SETTING_KEYS = [
  'referenceLanguage',
  'baseFileLanguage',
  'areas',
  'roots',
  'exclude',
  'variants',
  'checks.severity',
  'checks.ignoreSameAsReference',
  'diagnostics.missing',
] as const;

/** The settings {@link parseBackupSettings} reads, for the window (scope `window`). */
export const BACKUP_SETTING_KEYS = ['backup.intervalMinutes', 'backup.keep'] as const;

/** Allowed values of `backup.keep`, as declared in the manifest. */
export const BACKUP_KEEP_LIMITS = { minimum: 1, maximum: 100 } as const;

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = { intervalMinutes: 10, keep: 10 };

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

/** What the checks need from the settings of a folder; `errors`: the variants that could not be used. */
export function analysisOptions(settings: Settings): { options: AnalysisOptions; errors: string[] } {
  const { variants, errors } = compileVariants(settings.variants);
  return {
    options: {
      referenceLanguage: settings.referenceLanguage,
      baseFileLanguage: settings.baseFileLanguage,
      variants,
      severityOverrides: settings.severityOverrides,
      ignoreSameAsReference: settings.ignoreSameAsReference,
    },
    errors,
  };
}

const SEVERITY_VALUES = ['error', 'warning', 'info', 'off'] as const;
const MISSING_DIAGNOSTICS: readonly MissingDiagnostics[] = ['aggregate', 'individual', 'off'];

/** Validates user settings; invalid values fall back to the default and are reported, never thrown. */
export function parseSettings(raw: RawSettings): { settings: Settings; errors: string[] } {
  const errors: string[] = [];
  const pick = picker(raw, errors);
  const settings: Settings = {
    areas: parseAreas(raw['areas'], errors),
    roots: normalizeRoots(pick('roots', isRootsMap, DEFAULT_SETTINGS.roots), errors),
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

/** Validates the backup settings like {@link parseSettings} does the others. */
export function parseBackupSettings(raw: RawSettings): { settings: BackupSettings; errors: string[] } {
  const errors: string[] = [];
  const pick = picker(raw, errors);
  const { minimum, maximum } = BACKUP_KEEP_LIMITS;
  const settings: BackupSettings = {
    intervalMinutes: pick(
      'backup.intervalMinutes',
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
      DEFAULT_BACKUP_SETTINGS.intervalMinutes,
    ),
    keep: pick(
      'backup.keep',
      (value) => Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum,
      DEFAULT_BACKUP_SETTINGS.keep,
    ),
  };
  return { settings, errors };
}

/** Takes a raw value if it is valid; otherwise reports it and takes the fallback. */
function picker(raw: RawSettings, errors: string[]) {
  return <T>(key: string, valid: (value: unknown) => boolean, fallback: T): T => {
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

function normalizeRoots(
  roots: Readonly<Record<string, string[]>>,
  errors: string[],
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(roots).map(([areaId, paths]) => {
      const normalized: string[] = [];
      for (const path of paths) {
        const root = normalizeRoot(path);
        if (root === undefined) {
          errors.push(`eduI18n.roots.${areaId}: "${path}" must be a folder inside the workspace.`);
        } else if (!normalized.includes(root)) {
          normalized.push(root);
        }
      }
      return [areaId, normalized];
    }),
  );
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
