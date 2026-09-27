import { AiError } from '../../src/core/ai/aiErrors';
import { keyProblem } from '../../src/core/ai/apiKey';
import {
  chatCompletion,
  listModels,
  type ClientOptions,
  type TokenUsage,
} from '../../src/core/ai/bapiClient';
import { CHECK_FORMAT, checkMessages, parseCheck, type CheckItem } from '../../src/core/ai/checkPrompt';
import { describeLanguage } from '../../src/core/ai/languages';
import { completionBody, tokenBudget } from '../../src/core/ai/modelProfiles';
import {
  parseTranslations,
  TRANSLATIONS_FORMAT,
  translationMessages,
  type PromptItem,
} from '../../src/core/ai/prompts';
import { allowedBaseUrl, DEFAULT_AI_SETTINGS, DEFAULT_BASE_URL } from '../../src/core/config/aiSettings';

/** Synthetic texts: nothing of anyone's files goes to the b-api. */
const SOURCES: readonly PromptItem[] = [
  { key: 'SMOKE.SAVE', source: 'Speichern' },
  { key: 'SMOKE.GREETING', source: 'Hallo {{name}}, willkommen zurück!' },
  { key: 'SMOKE.SELECTED', source: '{{count}} Dateien ausgewählt' },
];
/** Translations to check; the second renames its placeholder, which the check has to find. */
const TRANSLATIONS: readonly CheckItem[] = [
  { key: 'SMOKE.SAVE', source: 'Speichern', text: 'Enregistrer' },
  {
    key: 'SMOKE.GREETING',
    source: 'Hallo {{name}}, willkommen zurück!',
    text: 'Bonjour {{nom}}, bon retour !',
  },
  { key: 'SMOKE.SELECTED', source: '{{count}} Dateien ausgewählt', text: '{{count}} fichiers sélectionnés' },
];
const RENAMED = 'SMOKE.GREETING';

/** The texts the smoke test sends; its report never shows them. */
export const SMOKE_TEXTS: readonly string[] = [
  ...SOURCES.map((item) => item.source),
  ...TRANSLATIONS.map((item) => item.text),
];

const language = (code: string) => ({ code, description: describeLanguage(code, {}) });

/**
 * The live smoke test of the AI (task 3.15): the models of the b-api, a translation and a check of a few synthetic
 * texts, with the defaults of the settings (EDU_I18N_AI_BASE_URL and EDU_I18N_AI_MODEL try others). Runs only with
 * EDU_I18N_AI_SMOKE=1, since it costs tokens; reports statuses, durations, tokens and counts, never the key or a
 * text. Returns the exit code: 1 when the key is unusable or a request fails.
 */
export async function smokeAi(
  env: Readonly<Record<string, string | undefined>>,
  fetch: typeof globalThis.fetch,
  log: (line: string) => void,
): Promise<number> {
  if (env['EDU_I18N_AI_SMOKE'] !== '1') {
    log(
      'The live smoke test sends synthetic texts to the b-api and costs tokens: run it with EDU_I18N_AI_SMOKE=1.',
    );
    return 0;
  }
  const key = env['B_API_KEY'] ?? '';
  const problem = keyProblem(key);
  if (problem) {
    log(`B_API_KEY is not usable: ${problem}.`);
    return 1;
  }
  const baseUrl = allowedBaseUrl(env['EDU_I18N_AI_BASE_URL'] ?? DEFAULT_BASE_URL);
  if (baseUrl === undefined) {
    log('EDU_I18N_AI_BASE_URL is no address the AI may use: https:, or http: on this machine.');
    return 1;
  }
  const settings = { ...DEFAULT_AI_SETTINGS, model: env['EDU_I18N_AI_MODEL'] ?? DEFAULT_AI_SETTINGS.model };
  const client: ClientOptions = {
    baseUrl,
    provider: settings.provider,
    key: key.trim(),
    timeoutMs: settings.timeoutSeconds * 1000,
    fetch,
  };
  log(`b-api ${new URL(baseUrl).host}, provider ${settings.provider}, model ${settings.model}`);

  const steps: [string, () => Promise<string>][] = [
    [
      'models',
      async () => {
        const models = await listModels(client);
        const offered = models.includes(settings.model) ? 'among them' : 'NOT among them';
        return `${models.length} offered, ${settings.model} ${offered}`;
      },
    ],
    [
      'translation',
      async () => {
        const effort = settings.reasoningEffort;
        const characters = SOURCES.reduce((sum, item) => sum + item.source.length, 0);
        const { content, usage } = await chatCompletion(
          client,
          completionBody({
            model: settings.model,
            messages: translationMessages({
              source: language('de'),
              target: language('fr'),
              variant: false,
              syntax: 'double-brace',
              html: false,
              items: SOURCES,
            }),
            format: TRANSLATIONS_FORMAT,
            effort,
            maxTokens: tokenBudget(characters, effort),
          }),
        );
        const { texts } = parseTranslations(
          content,
          SOURCES.map((item) => item.key),
        );
        const kept = SOURCES.filter((item) => {
          const text = texts.get(item.key);
          return (
            text !== undefined && placeholders(item.source).every((placeholder) => text.includes(placeholder))
          );
        }).length;
        return `${texts.size} of ${SOURCES.length} answered, placeholders kept in ${kept} of ${SOURCES.length}${tokens(usage)}`;
      },
    ],
    [
      'check',
      async () => {
        const effort = settings.reviewReasoningEffort;
        const characters = TRANSLATIONS.reduce((sum, item) => sum + item.source.length + item.text.length, 0);
        const { content, usage } = await chatCompletion(
          client,
          completionBody({
            model: settings.model,
            messages: checkMessages({
              source: language('de'),
              target: language('fr'),
              variant: false,
              syntax: 'double-brace',
              html: false,
              uiLanguage: 'English',
              items: TRANSLATIONS,
            }),
            format: CHECK_FORMAT,
            effort,
            maxTokens: tokenBudget(characters, effort),
          }),
        );
        const { verdicts } = parseCheck(
          content,
          TRANSLATIONS.map((item) => item.key),
        );
        const severities = ['error', 'warning', 'info'] as const;
        const found = severities
          .map(
            (severity) =>
              [
                severity,
                [...verdicts.values()].filter((v) => !v.ok && v.severity === severity).length,
              ] as const,
          )
          .filter(([, count]) => count > 0)
          .map(([severity, count]) => `${severity} ${count}`);
        const renamed = verdicts.get(RENAMED)?.ok === false ? 'found' : 'NOT found';
        return `${verdicts.size} of ${TRANSLATIONS.length} answered, findings: ${found.join(', ') || 'none'}; the renamed placeholder ${renamed}${tokens(usage)}`;
      },
    ],
  ];
  for (const [name, run] of steps) {
    const started = Date.now();
    try {
      log(`${name}: ok, ${await run()} (${Date.now() - started} ms)`);
    } catch (error) {
      // An AiError names its code and status, never the key; of anything else only its kind is shown.
      const reason =
        error instanceof AiError
          ? `${error.code}${error.status === undefined ? '' : ` (HTTP ${error.status})`}`
          : error instanceof Error
            ? error.name
            : 'error';
      log(`${name}: failed, ${reason} (${Date.now() - started} ms)`);
      return 1;
    }
  }
  return 0;
}

function placeholders(text: string): string[] {
  return text.match(/\{\{\w+\}\}/g) ?? [];
}

function tokens(usage: TokenUsage | undefined): string {
  if (!usage) {
    return '';
  }
  const reasoning = usage.reasoning === undefined ? '' : ` (reasoning ${usage.reasoning})`;
  return `; tokens ${usage.prompt ?? '?'} + ${usage.completion ?? '?'}${reasoning}`;
}
