import type { Bundle } from '../model/bundle';
import type { LocaleCode } from '../model/types';
import { chunkItems, type JobItem } from './aiJob';
import type { CheckItem } from './checkPrompt';
import type { PromptItem } from './prompts';
import { contextTexts, promptKeys } from './sources';

/** Characters of texts and context per request, at most (K9): long mail messages go in requests of their own. */
export const MAX_CHARACTERS = 8000;

/** The texts of a language that a job takes, each with the text it has now (null: none). */
export interface ItemChoice {
  locale: LocaleCode;
  source: LocaleCode;
  entries: readonly { entryId: string; before: string | null }[];
}

/** What the review list shows of a text a job asked about: its entry, its source, and the text it has now. */
export interface JobEntry<B = string | null> {
  entryId: string;
  source: string;
  before: B;
}

/**
 * The items of a fill, each text under the key the model gets (K2) with its source and its texts in other languages
 * (not the variants, whose texts differ on purpose), and the entries of the review list by that key.
 */
export function fillItems(
  bundle: Bundle,
  choice: ItemChoice,
  variantLocales: readonly LocaleCode[],
): { items: PromptItem[]; entries: Map<string, JobEntry> } {
  const skip = [choice.source, choice.locale, ...variantLocales];
  const entries = new Map<string, JobEntry>();
  const keys = promptKeys(choice.entries.map(({ entryId }) => entryId));
  const items = choice.entries.map(({ entryId, before }, index): PromptItem => {
    const key = keys[index]!;
    const source = bundle.value(entryId, choice.source) ?? '';
    entries.set(key, { entryId, source, before });
    return { key, source, context: contextTexts(bundle, entryId, skip) };
  });
  return { items, entries };
}

/** The items of a check: as those of a fill, with the translation to check. */
export function checkItems(
  bundle: Bundle,
  choice: ItemChoice,
  variantLocales: readonly LocaleCode[],
): { items: CheckItem[]; entries: Map<string, JobEntry<string>> } {
  const skip = [choice.source, choice.locale, ...variantLocales];
  const entries = new Map<string, JobEntry<string>>();
  const keys = promptKeys(choice.entries.map(({ entryId }) => entryId));
  const items = choice.entries.map(({ entryId, before }, index): CheckItem => {
    const key = keys[index]!;
    const source = bundle.value(entryId, choice.source) ?? '';
    const text = before ?? '';
    entries.set(key, { entryId, source, before: text });
    return { key, source, text, context: contextTexts(bundle, entryId, skip) };
  });
  return { items, entries };
}

/** The requests a job of these items makes: the chunks of `runAiJob`, before any is halved for its length. */
export function requestCount(items: readonly JobItem[], batchSize: number): number {
  return chunkItems(items, { batchSize, maxCharacters: MAX_CHARACTERS }).length;
}
