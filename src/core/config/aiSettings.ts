import { picker, type RawSettings } from './settings';

export const AI_PROVIDERS = ['openai', 'academiccloud'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** The efforts the b-api takes; `minimal` it refuses with HTTP 400 (measured on 24.09.2026). */
export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** Validated `eduI18n.ai.*` settings; like the backup settings, they apply to the window. */
export interface AiSettings {
  enabled: boolean;
  /** Without a slash at the end; `https:`, or `http:` on this machine only. */
  baseUrl: string;
  provider: AiProvider;
  model: string;
  /** For translations. */
  reasoningEffort: ReasoningEffort;
  /** For the check of translations, which weighs more. */
  reviewReasoningEffort: ReasoningEffort;
  batchSize: number;
  maxConcurrency: number;
  timeoutSeconds: number;
  /** What a language is, for the prompts: e.g. that `de-informal` uses "du". */
  languageDescriptions: Readonly<Record<string, string>>;
}

/** The settings {@link parseAiSettings} reads, as declared in the manifest (checked by a test). */
export const AI_SETTING_KEYS = [
  'ai.enabled',
  'ai.baseUrl',
  'ai.provider',
  'ai.model',
  'ai.reasoningEffort',
  'ai.reviewReasoningEffort',
  'ai.batchSize',
  'ai.maxConcurrency',
  'ai.timeoutSeconds',
  'ai.languageDescriptions',
] as const;

/** Allowed values of the numeric settings, as declared in the manifest. */
export const AI_LIMITS = {
  batchSize: { minimum: 1, maximum: 100 },
  maxConcurrency: { minimum: 1, maximum: 6 },
  timeoutSeconds: { minimum: 10, maximum: 600 },
} as const;

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_MODEL_LENGTH = 100;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  baseUrl: 'https://b-api.staging.openeduhub.net',
  provider: 'openai',
  model: 'gpt-6-luna',
  reasoningEffort: 'low',
  reviewReasoningEffort: 'medium',
  batchSize: 25,
  maxConcurrency: 2,
  timeoutSeconds: 120,
  // The German forms edu-sharing has, as the old app described them; other languages get their English name.
  languageDescriptions: {
    de: "German (formal, use 'Sie')",
    'de-informal': "German informal variant: use 'du' instead of 'Sie', otherwise the same content as 'de'",
    'de-no-binnen-i':
      "German without gender-neutral language (no Binnen-I, no gender star *), otherwise the same content as 'de'",
    de_DE: "German (Germany, formal, use 'Sie')",
    'de_DE-informal': "German (Germany, informal, use 'du')",
  },
};

/** Validates the AI settings; invalid values fall back to the default and are reported, never thrown. */
export function parseAiSettings(raw: RawSettings): { settings: AiSettings; errors: string[] } {
  const errors: string[] = [];
  const pick = picker(raw, errors);
  const within = (key: keyof typeof AI_LIMITS) => (value: unknown) =>
    Number.isInteger(value) &&
    (value as number) >= AI_LIMITS[key].minimum &&
    (value as number) <= AI_LIMITS[key].maximum;
  const effort = (value: unknown) => REASONING_EFFORTS.includes(value as ReasoningEffort);
  const baseUrl = pick(
    'ai.baseUrl',
    (value) => allowedBaseUrl(value) !== undefined,
    DEFAULT_AI_SETTINGS.baseUrl,
  );
  const settings: AiSettings = {
    enabled: pick('ai.enabled', (value) => typeof value === 'boolean', DEFAULT_AI_SETTINGS.enabled),
    baseUrl: allowedBaseUrl(baseUrl) ?? DEFAULT_AI_SETTINGS.baseUrl,
    provider: pick(
      'ai.provider',
      (value) => AI_PROVIDERS.includes(value as AiProvider),
      DEFAULT_AI_SETTINGS.provider,
    ),
    model: pick('ai.model', isModelId, DEFAULT_AI_SETTINGS.model),
    reasoningEffort: pick('ai.reasoningEffort', effort, DEFAULT_AI_SETTINGS.reasoningEffort),
    reviewReasoningEffort: pick(
      'ai.reviewReasoningEffort',
      effort,
      DEFAULT_AI_SETTINGS.reviewReasoningEffort,
    ),
    batchSize: pick('ai.batchSize', within('batchSize'), DEFAULT_AI_SETTINGS.batchSize),
    maxConcurrency: pick('ai.maxConcurrency', within('maxConcurrency'), DEFAULT_AI_SETTINGS.maxConcurrency),
    timeoutSeconds: pick('ai.timeoutSeconds', within('timeoutSeconds'), DEFAULT_AI_SETTINGS.timeoutSeconds),
    languageDescriptions: parseDescriptions(raw['ai.languageDescriptions'], errors),
  };
  return { settings, errors };
}

/**
 * The address without a slash at the end, if requests may go there with the key: `https:`, or `http:` to this
 * machine (a local proxy or test server); never with a user, a query or a fragment, which the endpoint path would
 * follow.
 */
export function allowedBaseUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Not an address at all.
    return undefined;
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && loopback);
  if (!secure || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    return undefined;
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

/** A model id as the b-api lists them: letters, digits, dots, dashes and underscores. */
function isModelId(value: unknown): boolean {
  return typeof value === 'string' && value.length <= MAX_MODEL_LENGTH && /^[\w.-]+$/.test(value);
}

function parseDescriptions(value: unknown, errors: string[]): Readonly<Record<string, string>> {
  if (value === undefined) {
    return DEFAULT_AI_SETTINGS.languageDescriptions;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push('eduI18n.ai.languageDescriptions must map language codes to descriptions.');
    return DEFAULT_AI_SETTINGS.languageDescriptions;
  }
  const descriptions: Record<string, string> = {};
  for (const [code, description] of Object.entries(value)) {
    if (code === '') {
      errors.push('eduI18n.ai.languageDescriptions: a language code must not be empty.');
    } else if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `eduI18n.ai.languageDescriptions.${code} must be a text of at most ${MAX_DESCRIPTION_LENGTH} characters.`,
      );
    } else {
      descriptions[code] = description;
    }
  }
  return descriptions;
}
