import * as vscode from 'vscode';
import { chatCompletion } from '../../core/ai/bapiClient';
import { describeLanguage } from '../../core/ai/languages';
import { completionBody, tokenBudget } from '../../core/ai/modelProfiles';
import {
  parseTranslations,
  TRANSLATIONS_FORMAT,
  translationMessages,
  type PromptItem,
} from '../../core/ai/prompts';
import { contextTexts, fillEntries, sourceLocale, type FillScope } from '../../core/ai/sources';
import { runAiJob, type JobResult } from '../../core/ai/aiJob';
import type { Bundle } from '../../core/model/bundle';
import { displayKey, keyFromId } from '../../core/model/keys';
import type { AiStatus } from '../services/aiService';
import type { IndexedRoot } from '../services/workspaceIndex';
import type { JobChoice, JobKind, JobRun } from './aiJobs';

/** Characters of source and context per request, at most (K9): long mail messages go in chunks of their own. */
const MAX_CHARACTERS = 8000;

/**
 * The languages of the bundle with texts to fill: a translation's missing and empty texts, a variant's texts the
 * variant needs (its missing ones fall back to its base, which is right).
 */
export function fillChoices(bundle: Bundle, root: IndexedRoot): JobChoice[] {
  const { variants } = root.settings;
  return bundle.locales.flatMap((locale) => {
    const source = sourceLocale(bundle, locale, variants);
    if (source === undefined) {
      return [];
    }
    const scopes: FillScope[] = variants[locale] ? ['variant-needed'] : ['missing', 'empty'];
    const entries = fillEntries(bundle, root.analysis.issues, locale, scopes, source);
    return entries.length > 0 ? [{ locale, source, entries }] : [];
  });
}

/** Translates the texts of a choice in chunks, as `runAiJob` does; the result names the texts without one. */
export function runFill({
  client,
  status,
  bundle,
  root,
  choice,
  signal,
  onItems,
}: JobRun): Promise<JobResult> {
  const { settings } = status;
  const { variants, baseFileLanguage } = root.settings;
  const describe = (code: string) => ({
    code,
    description: describeLanguage(code, settings.languageDescriptions, baseFileLanguage),
  });
  const skip = [choice.source, choice.locale, ...Object.keys(variants)];
  const entries = new Map<string, { entryId: string; source: string; before: string | null }>();
  const items: PromptItem[] = choice.entries.map(({ entryId, before }) => {
    const key = displayKey(keyFromId(entryId));
    const source = bundle.value(entryId, choice.source) ?? '';
    entries.set(key, { entryId, source, before });
    return { key, source, context: contextTexts(bundle, entryId, skip) };
  });
  const prompt = {
    source: describe(choice.source),
    target: describe(choice.locale),
    variant: choice.source === variants[choice.locale]?.base,
    syntax: root.analysis.area.placeholderSyntax ?? 'double-brace',
    html: bundle.format === 'mail-xml',
  } as const;
  return runAiJob(items, {
    batchSize: settings.batchSize,
    maxCharacters: MAX_CHARACTERS,
    concurrency: settings.maxConcurrency,
    signal,
    ask: async (chunk, chunkSignal) => {
      const characters = chunk.reduce(
        (sum, item) => sum + item.source.length + Object.values(item.context ?? {}).join('').length,
        0,
      );
      const { content } = await chatCompletion(
        client,
        completionBody({
          model: settings.model,
          messages: translationMessages({ ...prompt, items: chunk }),
          format: TRANSLATIONS_FORMAT,
          effort: settings.reasoningEffort,
          maxTokens: tokenBudget(characters, settings.reasoningEffort),
        }),
        chunkSignal,
      );
      return parseTranslations(
        content,
        chunk.map((item) => item.key),
      ).texts;
    },
    onProgress: ({ answers, done, total }) =>
      onItems(
        [...answers].flatMap(([key, text]) => {
          const entry = entries.get(key);
          return entry ? [{ ...entry, text }] : [];
        }),
        done,
        total,
      ),
  });
}

/** The question before a fill of many texts: what it fills, and how many requests go where. */
export function fillQuestion(bundle: Bundle, choice: JobChoice, status: AiStatus, requests: number): string {
  return vscode.l10n.t(
    'Fill {count} texts of {bundle} in {locale}? That takes about {requests} requests to {model} at {host}.',
    {
      count: String(choice.entries.length),
      bundle: bundle.name,
      locale: choice.locale,
      requests: String(requests),
      model: status.settings.model,
      host: status.host,
    },
  );
}

/** "Fill with AI…": the missing and empty texts of a language (a variant's needed ones), translated. */
export const FILL: JobKind = {
  kind: 'fill',
  choices: fillChoices,
  nothing: (bundle) =>
    vscode.l10n.t('{bundle} has no missing or empty texts to fill.', { bundle: bundle.name }),
  pickTitle: () => vscode.l10n.t('The language to fill with AI'),
  question: fillQuestion,
  start: () => vscode.l10n.t('Fill'),
  run: runFill,
};
