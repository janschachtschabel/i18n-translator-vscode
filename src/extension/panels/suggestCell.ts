import * as vscode from 'vscode';
import { chatCompletion } from '../../core/ai/bapiClient';
import { describeLanguage } from '../../core/ai/languages';
import { completionBody, tokenBudget } from '../../core/ai/modelProfiles';
import { parseTranslations, TRANSLATIONS_FORMAT, translationMessages } from '../../core/ai/prompts';
import type { Bundle } from '../../core/model/bundle';
import { displayKey } from '../../core/model/keys';
import type { PanelState } from '../../shared/protocol';
import { aiFailureMessage, unavailableMessage } from '../services/aiFeedback';
import type { AiService } from '../services/aiService';
import type { IndexSnapshot } from '../services/workspaceIndex';
import { findBundle } from './findBundle';

/** Other languages that go along as context, at most. */
const MAX_CONTEXT = 3;

export type SuggestResult = { text: string } | { message: string };

/**
 * A suggestion for the text of a key in `locale`, from the text of the reference, or of the base language for a
 * variant, with texts of other languages as context. The request carries the key and those texts only.
 */
export async function suggestCellText(
  ai: AiService,
  snapshot: IndexSnapshot | undefined,
  panel: PanelState,
  { entryId, locale }: { entryId: string; locale: string },
  log: vscode.LogOutputChannel,
  signal?: AbortSignal,
): Promise<SuggestResult> {
  const client = await ai.client();
  if (!client) {
    return { message: unavailableMessage((await ai.status()).reason ?? 'no-key') };
  }
  const found = snapshot && findBundle(snapshot, panel);
  const key = found?.bundle.keys.find((candidate) => candidate.id === entryId);
  if (!found || !key || !found.bundle.locales.includes(locale)) {
    return { message: vscode.l10n.t('The key or the language is no longer in this bundle.') };
  }
  const { bundle, root } = found;
  const shown = displayKey(key);
  const base = root.settings.variants[locale]?.base;
  const source = base !== undefined && bundle.locales.includes(base) ? base : bundle.reference;
  if (source === undefined || source === locale) {
    return {
      message: vscode.l10n.t('{locale} is the reference language: there is no text to translate from.', {
        locale,
      }),
    };
  }
  const sourceText = bundle.value(entryId, source);
  if (!sourceText?.trim()) {
    return {
      message: vscode.l10n.t('{key} has no text in {locale} to translate from.', {
        key: shown,
        locale: source,
      }),
    };
  }
  const { options, status } = client;
  const { settings } = status;
  const describe = (code: string) => ({
    code,
    description: describeLanguage(code, settings.languageDescriptions, root.settings.baseFileLanguage),
  });
  const context = contextTexts(bundle, entryId, [source, locale, ...Object.keys(root.settings.variants)]);
  const messages = translationMessages({
    source: describe(source),
    target: describe(locale),
    variant: source === base,
    syntax: root.analysis.area.placeholderSyntax ?? 'double-brace',
    html: bundle.format === 'mail-xml',
    items: [{ key: shown, source: sourceText, context }],
  });
  const characters = sourceText.length + Object.values(context).join('').length;
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
    const text = parseTranslations(content, [shown]).texts.get(shown);
    log.info(
      `Suggested a text of ${bundle.name} in ${locale} in ${Date.now() - started} ms (${usage?.total ?? '?'} tokens).`,
    );
    return text === undefined
      ? { message: vscode.l10n.t('The answer of the b-api had no text for this key.') }
      : { text };
  } catch (error) {
    log.warn(
      `No suggestion for ${bundle.name} in ${locale}: ${error instanceof Error ? error.message : 'failed'}.`,
    );
    return { message: aiFailureMessage(error, status) };
  }
}

/** Texts of the key in other languages, the English ones first, which help most with the meaning. */
function contextTexts(bundle: Bundle, entryId: string, skip: readonly string[]): Record<string, string> {
  const others = bundle.locales
    .filter((code) => !skip.includes(code))
    .sort((a, b) => Number(!isEnglish(a)) - Number(!isEnglish(b)));
  const context: Record<string, string> = {};
  for (const code of others) {
    const text = bundle.value(entryId, code);
    if (text?.trim() && Object.keys(context).length < MAX_CONTEXT) {
      context[code] = text;
    }
  }
  return context;
}

function isEnglish(code: string): boolean {
  return code === 'en' || code.startsWith('en_') || code.startsWith('en-') || code === 'default';
}
