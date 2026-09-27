import type { AreaDefinition, FormatId } from '../area/areaDefinition';
import type { ReasoningEffort } from '../config/aiSettings';
import type { Settings } from '../config/settings';
import type { LocaleCode } from '../model/types';
import { chatCompletion, type ClientOptions, type Completion } from './bapiClient';
import { describeLanguage } from './languages';
import { completionBody, tokenBudget, type AnswerFormat, type ChatMessage } from './modelProfiles';
import type { PromptItem, TranslationPrompt } from './prompts';

/**
 * What the prompts of a fill, a check and a suggestion say besides their texts: the two languages, whether the
 * target is a variant of the source, how the texts write placeholders, and whether they are mails.
 */
export type PromptFrame = Omit<TranslationPrompt, 'items'>;

export interface FrameOptions {
  /** The format of the bundle: mail templates are subjects and HTML messages. */
  format: FormatId;
  area: Pick<AreaDefinition, 'placeholderSyntax'>;
  /** The settings of the folder: its variants and the language of the base file. */
  settings: Pick<Settings, 'variants' | 'baseFileLanguage'>;
  /** `eduI18n.ai.languageDescriptions`. */
  descriptions: Readonly<Record<string, string>>;
  source: LocaleCode;
  target: LocaleCode;
}

/** The frame of the prompts that turn texts of `source` into `target`. */
export function promptFrame({
  format,
  area,
  settings,
  descriptions,
  source,
  target,
}: FrameOptions): PromptFrame {
  const describe = (code: LocaleCode) => ({
    code,
    description: describeLanguage(code, descriptions, settings.baseFileLanguage),
  });
  return {
    source: describe(source),
    target: describe(target),
    variant: source === settings.variants[target]?.base,
    syntax: area.placeholderSyntax ?? 'double-brace',
    html: format === 'mail-xml',
  };
}

/** The characters of an item that go to the model: its source, the text to check if any, and its context. */
export function itemCharacters(item: PromptItem & { text?: string }): number {
  return item.source.length + (item.text?.length ?? 0) + Object.values(item.context ?? {}).join('').length;
}

/** One request of a job; `characters`: of the texts and context it sends (see {@link itemCharacters}). */
export interface ChunkRequest {
  model: string;
  effort: ReasoningEffort;
  messages: readonly ChatMessage[];
  format: AnswerFormat;
  characters: number;
}

/** Sends one request, with a budget of tokens for the answer from the characters it sends. */
export function askChunk(
  client: ClientOptions,
  request: ChunkRequest,
  signal?: AbortSignal,
): Promise<Completion> {
  const { model, effort, messages, format, characters } = request;
  return chatCompletion(
    client,
    completionBody({ model, messages, format, effort, maxTokens: tokenBudget(characters, effort) }),
    signal,
  );
}
