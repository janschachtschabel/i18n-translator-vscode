import type { PlaceholderSyntax } from '../area/areaDefinition';
import { AiError } from './aiErrors';
import type { AnswerFormat, ChatMessage } from './modelProfiles';
import { GENDER_MARKER_RULE, isWellFormed, type PromptItem, type PromptLanguage } from './prompts';

/** A translation to check: its key, the text it was translated from, the translation, and other languages. */
export interface CheckItem extends PromptItem {
  text: string;
}

export interface CheckPrompt {
  source: PromptLanguage;
  target: PromptLanguage;
  /** The target is a variant of the source (e.g. `de-informal` of `de`). */
  variant: boolean;
  syntax: PlaceholderSyntax;
  /** Mail templates: subjects and HTML messages with conditions. */
  html: boolean;
  /** The language the problems are written in, that of VS Code (e.g. "German"). */
  uiLanguage: string;
  items: readonly CheckItem[];
}

export type CheckSeverity = 'error' | 'warning' | 'info';

/** What the model says about a translation: fine, or a problem, with a correction if it has one. */
export type CheckVerdict =
  { ok: true } | { ok: false; severity: CheckSeverity; problem: string; suggestion?: string };

const SEVERITIES: readonly CheckSeverity[] = ['error', 'warning', 'info'];

/**
 * The messages that ask a model to check translations (task 3.13): whether each says what its source says, as a
 * text of a user interface in the target language, by the rules the checks enforce; the texts as JSON, so that
 * nothing in them can pass for an instruction of the prompt's own.
 */
export function checkMessages(prompt: CheckPrompt): ChatMessage[] {
  const { source, target, variant, syntax, html, uiLanguage } = prompt;
  const name = (language: PromptLanguage) => `${language.description} [${language.code}]`;
  const example = syntax === 'single-brace' ? '{name}' : '{{name}}';
  const task = variant
    ? [
        'You check user interface texts of edu-sharing, an open-source platform for educational content.',
        `${name(target)} is a variant of ${name(source)}: its texts should differ from their source`,
        'only where the variant needs it, and follow the description of the variant.',
      ]
    : [
        'You check the translations of the user interface texts of edu-sharing, an open-source platform for',
        `educational content, from ${name(source)} to ${name(target)}.`,
      ];
  const checks = [
    '- the meaning: nothing missing, added or wrong;',
    `- every placeholder exactly as in the source, e.g. ${example};`,
    `- ${GENDER_MARKER_RULE}`,
    '- HTML tags and entities as in the source;',
    ...(html ? ['- the conditions of e-mails, such as {{if …}} … {{endif}}, as in the source;'] : []),
    '- the form of address and the terms the description of the language asks for, the same in every text;',
    '- spelling, grammar and the typography of the target language;',
    '- the length: texts of buttons and labels stay short.',
  ];
  const answer = [
    'Answer with a JSON object {"items": [{"key": …, "verdict": …, "severity": …, "problem": …, "suggestion": …}]},',
    'with exactly one item per key of the input and the key unchanged:',
    '- verdict "ok" if the translation is fine; then severity "info", problem and suggestion empty;',
    '- verdict "problem" otherwise, with severity "error" (wrong meaning, broken placeholders or markup), "warning"',
    '  (misleading, inconsistent, clumsy) or "info" (style), the problem in one sentence, and the corrected',
    '  translation as suggestion (empty if you have none).',
    `Write the problem in ${uiLanguage}. Report no problem for a translation that is merely not what you would write.`,
    'The context holds the text in other languages; use it only to understand the meaning.',
  ];
  const items = prompt.items.map(({ key, source: text, text: translation, context }) => ({
    key,
    source: text,
    translation,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  }));
  return [
    { role: 'system', content: [...task, '', 'Check:', ...checks, '', ...answer].join('\n') },
    { role: 'user', content: JSON.stringify({ items }) },
  ];
}

/** The schema of a check's answer; strict, so every item has all fields (empty where they do not apply). */
export const CHECK_FORMAT: AnswerFormat = {
  name: 'check',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            verdict: { type: 'string', enum: ['ok', 'problem'] },
            severity: { type: 'string', enum: [...SEVERITIES] },
            problem: { type: 'string' },
            suggestion: { type: 'string' },
          },
          required: ['key', 'verdict', 'severity', 'problem', 'suggestion'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

/**
 * The verdicts of an answer by their keys, never by their position. A problem without words to show counts as no
 * answer, an unknown severity as a warning; keys not asked for are dropped and counted, a key's second verdict is
 * dropped. Throws an AiError when the answer is no JSON of the schema.
 */
export function parseCheck(
  content: string,
  keys: readonly string[],
): { verdicts: Map<string, CheckVerdict>; missing: string[]; unknown: number } {
  let answer: unknown;
  try {
    answer = JSON.parse(content);
  } catch {
    throw new AiError('invalid-response');
  }
  const items =
    typeof answer === 'object' && answer !== null ? (answer as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) {
    throw new AiError('invalid-response');
  }
  const asked = new Set(keys);
  const verdicts = new Map<string, CheckVerdict>();
  let unknown = 0;
  for (const item of items) {
    const fields = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const key = fields['key'];
    if (typeof key !== 'string' || !asked.has(key)) {
      unknown++;
      continue;
    }
    const verdict = verdictOf(fields);
    if (verdict && !verdicts.has(key)) {
      verdicts.set(key, verdict);
    }
  }
  return { verdicts, missing: keys.filter((key) => !verdicts.has(key)), unknown };
}

function verdictOf(fields: Record<string, unknown>): CheckVerdict | undefined {
  if (fields['verdict'] === 'ok') {
    return { ok: true };
  }
  const problem = typeof fields['problem'] === 'string' ? fields['problem'].trim() : '';
  if (fields['verdict'] !== 'problem' || !problem) {
    return undefined;
  }
  const severity = SEVERITIES.includes(fields['severity'] as CheckSeverity)
    ? (fields['severity'] as CheckSeverity)
    : 'warning';
  const suggestion =
    typeof fields['suggestion'] === 'string' && isWellFormed(fields['suggestion'])
      ? fields['suggestion']
      : '';
  return { ok: false, severity, problem, ...(suggestion.trim() ? { suggestion } : {}) };
}
