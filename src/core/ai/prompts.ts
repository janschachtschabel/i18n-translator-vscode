import type { PlaceholderSyntax } from '../area/areaDefinition';
import { AiError } from './aiErrors';
import type { AnswerFormat, ChatMessage } from './modelProfiles';

/** A text to translate: its key (unique in a request, it comes back with the answer), its source and context. */
export interface PromptItem {
  key: string;
  source: string;
  /** Texts of the key in other languages, which help with its meaning (e.g. English for French). */
  context?: Readonly<Record<string, string>>;
}

export interface PromptLanguage {
  code: string;
  /** What the language is, see `describeLanguage`. */
  description: string;
}

export interface TranslationPrompt {
  source: PromptLanguage;
  target: PromptLanguage;
  /** The target is a variant of the source (e.g. `de-informal` of `de`): only what the variant needs changes. */
  variant: boolean;
  syntax: PlaceholderSyntax;
  /** Mail templates: subjects and HTML messages with conditions. */
  html: boolean;
  items: readonly PromptItem[];
}

/**
 * What the prompts say about the German gender marker, which the checks do not count as a placeholder: a variant
 * without gender forms (`de-no-binnen-i`) and other languages leave it out.
 */
export const GENDER_MARKER_RULE =
  '{{GENDER_SEPARATOR}} marks a gender form in German texts (it becomes *). In German keep it, unless the\n' +
  '  description of the target language says otherwise; in other languages leave it out.';

/**
 * The messages that ask a model to translate `items` (design §6.8): the languages, the rules the checks enforce,
 * and the texts as JSON, so that nothing in them can pass for an instruction of the prompt's own.
 */
export function translationMessages(prompt: TranslationPrompt): ChatMessage[] {
  const { source, target, variant, syntax, html } = prompt;
  const name = (language: PromptLanguage) => `${language.description} [${language.code}]`;
  const example = syntax === 'single-brace' ? '{name}' : '{{name}}';
  const task = variant
    ? [
        'You adapt user interface texts of edu-sharing, an open-source platform for educational content.',
        `The texts are in ${name(source)}. Adapt the texts to ${name(target)}.`,
        'Change only what the variant needs; keep everything else word for word.',
      ]
    : [
        'You translate the user interface texts of edu-sharing, an open-source platform for educational content,',
        `from ${name(source)} to ${name(target)}.`,
      ];
  const rules = [
    `- Keep every placeholder exactly as in the source, e.g. ${example}: do not translate, add or remove any.`,
    // Also in metadatasets, which write only this token with two braces.
    `- ${GENDER_MARKER_RULE}`,
    '- Keep HTML tags and entities as in the source; translate only the text between them.',
    ...(html
      ? [
          '- The texts are subjects and HTML messages of e-mails. Keep the HTML structure, and keep conditions such',
          '  as {{if …}} … {{endif}} as they are.',
        ]
      : []),
    '- Keep the meaning, the tone and about the length of the source: texts of buttons and labels stay short.',
    '- Use the typography of the target language (quotation marks, spaces, capitals).',
    '- The context holds the text in other languages; use it only to understand the meaning.',
  ];
  const answer =
    'Answer with a JSON object {"items": [{"key": …, "text": …}]}, with exactly one item per key of the input and ' +
    'the key unchanged.';
  const items = prompt.items.map(({ key, source: text, context }) => ({
    key,
    source: text,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  }));
  return [
    { role: 'system', content: [...task, '', 'Rules:', ...rules, '', answer].join('\n') },
    { role: 'user', content: JSON.stringify({ items }) },
  ];
}

/** The schema of a translation answer; strict, so that every item has its key and text and nothing else. */
export const TRANSLATIONS_FORMAT: AnswerFormat = {
  name: 'translations',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { key: { type: 'string' }, text: { type: 'string' } },
          required: ['key', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

/**
 * The texts of an answer by their keys, never by their position: a model may reorder, skip or merge items. Keys
 * that were not asked for are dropped and counted, a key's second text is dropped; `missing` are the keys asked
 * for without a text. Throws an AiError when the answer is no JSON of the schema.
 */
export function parseTranslations(
  content: string,
  keys: readonly string[],
): { texts: Map<string, string>; missing: string[]; unknown: number } {
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
  const texts = new Map<string, string>();
  let unknown = 0;
  for (const item of items) {
    const { key, text } = (typeof item === 'object' && item !== null ? item : {}) as {
      key?: unknown;
      text?: unknown;
    };
    if (typeof key !== 'string' || !asked.has(key)) {
      unknown++;
    } else if (typeof text === 'string' && !texts.has(key)) {
      texts.set(key, text);
    }
  }
  return { texts, missing: keys.filter((key) => !texts.has(key)), unknown };
}
