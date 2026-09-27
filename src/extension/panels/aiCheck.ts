import * as vscode from 'vscode';
import { runAiJob, type JobResult } from '../../core/ai/aiJob';
import { chatCompletion } from '../../core/ai/bapiClient';
import {
  CHECK_FORMAT,
  checkMessages,
  parseCheck,
  type CheckItem,
  type CheckVerdict,
} from '../../core/ai/checkPrompt';
import { describeLanguage } from '../../core/ai/languages';
import { completionBody, tokenBudget } from '../../core/ai/modelProfiles';
import { checkEntries, contextTexts, sourceLocale } from '../../core/ai/sources';
import type { Bundle } from '../../core/model/bundle';
import { displayKey, keyFromId } from '../../core/model/keys';
import type { AiJobItem } from '../../shared/aiProtocol';
import type { IndexedRoot } from '../services/workspaceIndex';
import type { JobChoice, JobKind, JobRun } from './aiJobs';

/** Characters of texts and context per request, at most, as for the fill (K9). */
const MAX_CHARACTERS = 8000;

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
  const { variants, baseFileLanguage } = root.settings;
  const describe = (code: string) => ({
    code,
    description: describeLanguage(code, settings.languageDescriptions, baseFileLanguage),
  });
  const skip = [choice.source, choice.locale, ...Object.keys(variants)];
  const entries = new Map<string, { entryId: string; source: string; before: string }>();
  const items: CheckItem[] = choice.entries.map(({ entryId, before }) => {
    const key = displayKey(keyFromId(entryId));
    const source = bundle.value(entryId, choice.source) ?? '';
    const text = before ?? '';
    entries.set(key, { entryId, source, before: text });
    return { key, source, text, context: contextTexts(bundle, entryId, skip) };
  });
  const prompt = {
    source: describe(choice.source),
    target: describe(choice.locale),
    variant: choice.source === variants[choice.locale]?.base,
    syntax: root.analysis.area.placeholderSyntax ?? 'double-brace',
    html: bundle.format === 'mail-xml',
    uiLanguage: uiLanguage(vscode.env.language),
  } as const;
  const effort = settings.reviewReasoningEffort;
  return runAiJob<CheckItem, CheckVerdict>(items, {
    batchSize: settings.batchSize,
    maxCharacters: MAX_CHARACTERS,
    concurrency: settings.maxConcurrency,
    signal,
    ask: async (chunk, chunkSignal) => {
      const characters = chunk.reduce(
        (sum, item) =>
          sum + item.source.length + item.text.length + Object.values(item.context ?? {}).join('').length,
        0,
      );
      const { content } = await chatCompletion(
        client,
        completionBody({
          model: settings.model,
          messages: checkMessages({ ...prompt, items: chunk }),
          format: CHECK_FORMAT,
          effort,
          maxTokens: tokenBudget(characters, effort),
        }),
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
