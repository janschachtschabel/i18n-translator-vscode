import { isEntryId, isId } from './messageChecks';

/** Why the AI cannot be used; the editor offers the setup for a missing key. */
export type AiUnavailableReason = 'disabled' | 'untrusted' | 'no-key';

/** What the webview asks of the AI (design §6.12); part of `WebviewToHost`, checked like the other messages. */
export type AiWebviewToHost =
  /** A suggestion for the text of a cell, for its open editor. */
  | { type: 'aiSuggest'; requestId: string; entryId: string; locale: string }
  | { type: 'aiCancel'; requestId: string }
  /** The editor offers to set the key when there is none. */
  | { type: 'aiSetup' };

/** What the host tells the editor about the AI; part of `HostToWebview`. */
export type AiHostToWebview =
  | { type: 'aiState'; available: boolean; reason?: AiUnavailableReason; model: string }
  /** The text for the cell, or why there is none, in the user's language. */
  | { type: 'aiSuggestion'; requestId: string; text?: string; message?: string };

export const AI_MESSAGE_TYPES: readonly string[] = ['aiSuggest', 'aiCancel', 'aiSetup'];

/** Whether an AI message of the webview has valid fields; `value` is a record with one of those types. */
export function isAiWebviewToHost(value: Readonly<Record<string, unknown>>): boolean {
  switch (value['type']) {
    case 'aiSuggest':
      return isId(value['requestId']) && isEntryId(value['entryId']) && isId(value['locale']);
    case 'aiCancel':
      return isId(value['requestId']);
    case 'aiSetup':
      return true;
    default:
      return false;
  }
}
