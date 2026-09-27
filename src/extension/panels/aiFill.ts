import * as vscode from 'vscode';
import type { ClientOptions } from '../../core/ai/bapiClient';
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
import { planTexts } from '../../core/edit/planTexts';
import type { Bundle } from '../../core/model/bundle';
import { displayKey, keyFromId } from '../../core/model/keys';
import type { AiApplyItem, AiJobItem } from '../../shared/aiProtocol';
import { localize } from '../localize';
import type { AiStatus } from '../services/aiService';
import type { FileStore } from '../services/fileStore';
import { rootRef, type IndexedRoot } from '../services/workspaceIndex';
import { describeWriteFailure, showWriteFailure } from '../services/writeFeedback';
import { inBundle } from './findBundle';

/** Characters of source and context per request, at most (K9): long mail messages go in chunks of their own. */
const MAX_CHARACTERS = 8000;

/** A language of a bundle with texts to fill, and where they are translated from. */
export interface FillChoice {
  locale: string;
  source: string;
  /** In the order of the bundle's keys, with the text each has now (null: none). */
  entries: { entryId: string; before: string | null }[];
}

/**
 * The languages of the bundle with texts to fill: a translation's missing and empty texts, a variant's texts the
 * variant needs (its missing ones fall back to its base, which is right).
 */
export function fillChoices(bundle: Bundle, root: IndexedRoot): FillChoice[] {
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

export interface FillRun {
  client: ClientOptions;
  status: AiStatus;
  bundle: Bundle;
  root: IndexedRoot;
  choice: FillChoice;
  signal: AbortSignal;
  /** Suggestions as they come, with how many texts are done. */
  onItems: (items: AiJobItem[], done: number, total: number) => void;
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
}: FillRun): Promise<JobResult> {
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

/** How a write of reviewed texts went, for the webview. */
export interface ApplyOutcome {
  written: string[];
  skipped: { entryId: string; message: string }[];
  message?: string;
}

/**
 * Writes reviewed texts of a language as one change of its file (planTexts), always backed up first, and one step
 * of undo. Texts that changed meanwhile or that the file cannot hold are skipped with their reason; a failure of the
 * whole write (Restricted Mode, a file with unsaved changes) says why, and offers the step that solves it.
 */
export async function applyFill(
  fileStore: FileStore,
  found: { root: IndexedRoot; bundle: Bundle },
  locale: string,
  items: readonly AiApplyItem[],
): Promise<ApplyOutcome> {
  const describe = (skipped: ReturnType<typeof planTexts>['skipped']) =>
    skipped.map(({ entryId, problem }) => ({ entryId, message: localize(problem.message) }));
  // Nothing to write: say what was skipped, without a backup of nothing.
  const preview = planTexts(found.bundle, locale, items);
  if (preview.changes.length === 0) {
    return { written: [], skipped: describe(preview.skipped) };
  }
  let plan = preview;
  const result = await fileStore.write(
    rootRef(found.root),
    inBundle(found.bundle.id, (bundle) => {
      // Planned again on the files as they are when written (B5).
      plan = planTexts(bundle, locale, items);
      return { ok: true, changes: plan.changes };
    }),
    { bulk: true },
  );
  if (!result.ok) {
    if (result.reason !== 'problem') {
      void showWriteFailure(result);
    }
    return { written: [], skipped: [], message: describeWriteFailure(result) };
  }
  return { written: plan.planned, skipped: describe(plan.skipped) };
}

/** The question before a fill of many texts: what it fills, and how many requests go where. */
export function fillQuestion(bundle: Bundle, choice: FillChoice, status: AiStatus, requests: number): string {
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
