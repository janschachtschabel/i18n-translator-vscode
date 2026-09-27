import * as vscode from 'vscode';
import { askChunk, promptFrame } from '../../core/ai/jobPrompt';
import { parseTranslations, TRANSLATIONS_FORMAT, translationMessages } from '../../core/ai/prompts';
import { fillEntries, sourceLocale, type FillScope } from '../../core/ai/sources';
import { runAiJob, type JobResult } from '../../core/ai/aiJob';
import { fillItems, MAX_CHARACTERS, requestCount } from '../../core/ai/jobItems';
import type { Bundle } from '../../core/model/bundle';
import type { AiStatus } from '../services/aiService';
import type { IndexedRoot } from '../services/workspaceIndex';
import type { JobChoice, JobKind, JobRun } from './aiJobs';

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
  const { items, entries } = fillItems(bundle, choice, Object.keys(root.settings.variants));
  const frame = promptFrame({
    format: bundle.format,
    area: root.analysis.area,
    settings: root.settings,
    descriptions: settings.languageDescriptions,
    source: choice.source,
    target: choice.locale,
  });
  return runAiJob(items, {
    batchSize: settings.batchSize,
    maxCharacters: MAX_CHARACTERS,
    concurrency: settings.maxConcurrency,
    signal,
    ask: async (chunk, chunkSignal) => {
      const { content } = await askChunk(
        client,
        {
          model: settings.model,
          effort: settings.reasoningEffort,
          messages: translationMessages({ ...frame, items: chunk }),
          format: TRANSLATIONS_FORMAT,
          items: chunk,
        },
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
  requests: (bundle, root, choice, settings) =>
    requestCount(fillItems(bundle, choice, Object.keys(root.settings.variants)).items, settings.batchSize),
  question: fillQuestion,
  start: () => vscode.l10n.t('Fill'),
  run: runFill,
};
