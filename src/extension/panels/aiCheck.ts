import * as vscode from 'vscode';
import { runAiJob, type JobResult } from '../../core/ai/aiJob';
import {
  CHECK_FORMAT,
  checkMessages,
  parseCheck,
  type CheckItem,
  type CheckVerdict,
} from '../../core/ai/checkPrompt';
import { checkItems, MAX_CHARACTERS, requestCount } from '../../core/ai/jobItems';
import { askChunk, promptFrame } from '../../core/ai/jobPrompt';
import { checkEntries, sourceLocale } from '../../core/ai/sources';
import type { Bundle } from '../../core/model/bundle';
import type { AiJobItem } from '../../shared/aiProtocol';
import type { IndexedRoot } from '../services/workspaceIndex';
import type { JobChoice, JobKind, JobRun } from './aiJobs';

/** The languages of the bundle with translations to check (a variant: its own texts, against its base). */
export function checkChoices(bundle: Bundle, root: IndexedRoot): JobChoice[] {
  return bundle.locales.flatMap((locale) => {
    const source = sourceLocale(bundle, locale, root.settings.variants);
    if (source === undefined) {
      return [];
    }
    const entries = checkEntries(bundle, locale, source);
    return entries.length > 0 ? [{ locale, source, entries }] : [];
  });
}

/**
 * Checks the texts of a choice in chunks, as `runAiJob` does; the review list gets the texts with a problem, each
 * with the correction (or its text, to correct by hand). The result names the texts without an answer.
 */
export function runCheck({
  client,
  status,
  bundle,
  root,
  choice,
  signal,
  onItems,
}: JobRun): Promise<JobResult> {
  const { settings } = status;
  const { items, entries } = checkItems(bundle, choice, Object.keys(root.settings.variants));
  const prompt = {
    ...promptFrame({
      format: bundle.format,
      area: root.analysis.area,
      settings: root.settings,
      descriptions: settings.languageDescriptions,
      source: choice.source,
      target: choice.locale,
    }),
    uiLanguage: uiLanguage(vscode.env.language),
  };
  return runAiJob<CheckItem, CheckVerdict>(items, {
    batchSize: settings.batchSize,
    maxCharacters: MAX_CHARACTERS,
    concurrency: settings.maxConcurrency,
    signal,
    ask: async (chunk, chunkSignal) => {
      const { content } = await askChunk(
        client,
        {
          model: settings.model,
          effort: settings.reviewReasoningEffort,
          messages: checkMessages({ ...prompt, items: chunk }),
          format: CHECK_FORMAT,
          items: chunk,
        },
        chunkSignal,
      );
      return parseCheck(
        content,
        chunk.map((item) => item.key),
      ).verdicts;
    },
    onProgress: ({ answers, done, total }) =>
      onItems(
        [...answers].flatMap(([key, verdict]): AiJobItem[] => {
          const entry = entries.get(key);
          return entry && !verdict.ok
            ? [
                {
                  ...entry,
                  text: verdict.suggestion ?? entry.before,
                  problem: { severity: verdict.severity, message: verdict.problem },
                },
              ]
            : [];
        }),
        done,
        total,
      ),
  });
}

/** The language of VS Code in English words, for the prompt: the model writes the problems in it. */
export function uiLanguage(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? 'English';
  } catch {
    // Not a language tag Intl knows.
    return 'English';
  }
}

/** "Check with AI…": the translations of a language, judged against their source. */
export const CHECK: JobKind = {
  kind: 'check',
  choices: checkChoices,
  nothing: (bundle) => vscode.l10n.t('{bundle} has no translations to check.', { bundle: bundle.name }),
  pickTitle: () => vscode.l10n.t('The language to check with AI'),
  requests: (bundle, root, choice, settings) =>
    requestCount(checkItems(bundle, choice, Object.keys(root.settings.variants)).items, settings.batchSize),
  question: (bundle, choice, status, requests) =>
    vscode.l10n.t(
      'Check {count} texts of {bundle} in {locale}? That takes about {requests} requests to {model} at {host}.',
      {
        count: String(choice.entries.length),
        bundle: bundle.name,
        locale: choice.locale,
        requests: String(requests),
        model: status.settings.model,
        host: status.host,
      },
    ),
  start: () => vscode.l10n.t('Check'),
  run: runCheck,
};
