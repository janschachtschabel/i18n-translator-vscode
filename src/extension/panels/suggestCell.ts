import * as vscode from 'vscode';
import type { AiSettings } from '../../core/config/aiSettings';
import { chatCompletion, type ClientOptions } from '../../core/ai/bapiClient';
import { describeLanguage } from '../../core/ai/languages';
import { completionBody, tokenBudget, type ChatMessage } from '../../core/ai/modelProfiles';
import { parseTranslations, TRANSLATIONS_FORMAT, translationMessages } from '../../core/ai/prompts';
import { contextTexts, sourceLocale } from '../../core/ai/sources';
import { displayKey } from '../../core/model/keys';
import type { PanelState } from '../../shared/protocol';
import { aiFailureMessage } from '../services/aiFeedback';
import type { AiStatus } from '../services/aiService';
import type { IndexSnapshot } from '../services/workspaceIndex';
import { findBundle } from './findBundle';

export type SuggestResult = { text: string } | { message: string };

/** What a suggestion for a cell sends, prepared before anything goes out (and before the consent is asked). */
export interface SuggestionRequest {
  bundleName: string;
  locale: string;
  /** The key as the answer names it. */
  key: string;
  messages: ChatMessage[];
  /** Characters of the source and its context, for the token budget. */
  characters: number;
}

/**
 * The request for a suggestion for the text of a key in `locale`: from the text of the reference, or of the base
 * language for a variant, with texts of other languages as context; or why there is none. The request carries the
 * key and those texts only.
 */
export function suggestionRequest(
  snapshot: IndexSnapshot | undefined,
  panel: PanelState,
  { entryId, locale }: { entryId: string; locale: string },
  settings: AiSettings,
): SuggestionRequest | { message: string } {
  const found = snapshot && findBundle(snapshot, panel);
  const entry = found?.bundle.keys.find((candidate) => candidate.id === entryId);
  if (!found || !entry || !found.bundle.locales.includes(locale)) {
    return { message: vscode.l10n.t('The key or the language is no longer in this bundle.') };
  }
  const { bundle, root } = found;
  const key = displayKey(entry);
  if (bundle.reference === undefined) {
    return {
      message: vscode.l10n.t('{bundle} has no reference language to translate from.', {
        bundle: bundle.name,
      }),
    };
  }
  const source = sourceLocale(bundle, locale, root.settings.variants);
  if (source === undefined) {
    return {
      message: vscode.l10n.t('{locale} is the reference language: there is no text to translate from.', {
        locale,
      }),
    };
  }
  const sourceText = bundle.value(entryId, source);
  if (!sourceText?.trim()) {
    return {
      message: vscode.l10n.t('{key} has no text in {locale} to translate from.', { key, locale: source }),
    };
  }
  const describe = (code: string) => ({
    code,
    description: describeLanguage(code, settings.languageDescriptions, root.settings.baseFileLanguage),
  });
  const context = contextTexts(bundle, entryId, [source, locale, ...Object.keys(root.settings.variants)]);
  const messages = translationMessages({
    source: describe(source),
    target: describe(locale),
    variant: source === root.settings.variants[locale]?.base,
    syntax: root.analysis.area.placeholderSyntax ?? 'double-brace',
    html: bundle.format === 'mail-xml',
    items: [{ key, source: sourceText, context }],
  });
  const characters = sourceText.length + Object.values(context).join('').length;
  return { bundleName: bundle.name, locale, key, messages, characters };
}

/** Sends a prepared request; the answer is the text for the key, or why there is none, in the user's language. */
export async function requestSuggestion(
  client: { options: ClientOptions; status: AiStatus },
  request: SuggestionRequest,
  log: vscode.LogOutputChannel,
  signal?: AbortSignal,
): Promise<SuggestResult> {
  const { options, status } = client;
  const { settings } = status;
  const { bundleName, locale, key, messages, characters } = request;
  const started = Date.now();
  try {
    const { content, usage } = await chatCompletion(
      options,
      completionBody({
        model: settings.model,
        messages,
        format: TRANSLATIONS_FORMAT,
        effort: settings.reasoningEffort,
        maxTokens: tokenBudget(characters, settings.reasoningEffort),
      }),
      signal,
    );
    const text = parseTranslations(content, [key]).texts.get(key);
    log.info(
      `Suggested a text of ${bundleName} in ${locale} in ${Date.now() - started} ms (${usage?.total ?? '?'} tokens).`,
    );
    // An empty answer would empty the field: it is no suggestion.
    return text === undefined || !text.trim()
      ? { message: vscode.l10n.t('The answer of the b-api had no text for this key.') }
      : { text };
  } catch (error) {
    log.warn(
      `No suggestion for ${bundleName} in ${locale}: ${error instanceof Error ? error.message : 'failed'}.`,
    );
    return { message: aiFailureMessage(error, status) };
  }
}
