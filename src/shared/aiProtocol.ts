import type { AiUnavailable } from '../core/ai/connection';
import { isBounded, isEntryId, isId, isRecord, isText } from './messageChecks';

/** Why the AI cannot be used; the editor offers the setup for a missing key. */
export type AiUnavailableReason = AiUnavailable;

/** A reviewed text to write; `before` is the text it was made for (null: none), which the host checks (B5). */
export interface AiApplyItem {
  entryId: string;
  value: string;
  before: string | null;
}

/**
 * A suggestion of a job for the review list; `source` is the text it was translated from. A check's item has the
 * problem it found, and as `text` the correction, or the text as it is when there is none.
 */
export interface AiJobItem {
  entryId: string;
  source: string;
  before: string | null;
  text: string;
  problem?: { severity: 'error' | 'warning' | 'info'; message: string };
}

/** What the webview asks of the AI (design §6.12); part of `WebviewToHost`, checked like the other messages. */
export type AiWebviewToHost =
  /** A suggestion for the text of a cell, for its open editor. */
  | { type: 'aiSuggest'; requestId: string; entryId: string; locale: string }
  /** Cancels a suggestion or a job (its id). */
  | { type: 'aiCancel'; requestId: string }
  /** The editor offers to set the key when there is none. */
  | { type: 'aiSetup' }
  /** Fills a language of the bundle; the host asks which. */
  | { type: 'aiFill' }
  /** Checks the translations of a language of the bundle; the host asks which. */
  | { type: 'aiCheck' }
  /** Writes reviewed texts of a job, as one change. */
  | { type: 'aiApply'; requestId: string; jobId: string; items: AiApplyItem[] };

/** What the host tells the editor about the AI; part of `HostToWebview`. */
export type AiHostToWebview =
  | { type: 'aiState'; available: boolean; reason?: AiUnavailableReason; model: string }
  /** The text for the cell, or why there is none, in the user's language. */
  | { type: 'aiSuggestion'; requestId: string; text?: string; message?: string }
  /** A job began: the editor shows its review list; `source`: the language its texts are translated from. */
  | { type: 'aiJob'; jobId: string; kind: 'fill' | 'check'; locale: string; source: string; total: number }
  /** Suggestions of a job as they come, with how many texts are done. */
  | { type: 'aiJobItems'; jobId: string; items: AiJobItem[]; done: number; total: number }
  /** A job ended; `missing`: texts without an answer; `message`: why it failed, in the user's language. */
  | {
      type: 'aiJobEnd';
      jobId: string;
      status: 'done' | 'cancelled' | 'failed';
      missing: number;
      message?: string;
    }
  /** How a write of reviewed texts went; `message` says why it failed as a whole. */
  | {
      type: 'aiApplyResult';
      requestId: string;
      written: string[];
      skipped: { entryId: string; message: string }[];
      message?: string;
    };

/** Reviewed texts in one write, at most: far more than a language of a bundle holds, but bounded. */
export const MAX_APPLY_ITEMS = 2000;

/** Whether an AI message of the webview has valid fields; `value` is a record with one of those types. */
export function isAiWebviewToHost(value: Readonly<Record<string, unknown>>): boolean {
  switch (value['type']) {
    case 'aiSuggest':
      return isId(value['requestId']) && isEntryId(value['entryId']) && isId(value['locale']);
    case 'aiCancel':
      return isId(value['requestId']);
    case 'aiSetup':
    case 'aiFill':
    case 'aiCheck':
      return true;
    case 'aiApply':
      return (
        isId(value['requestId']) &&
        isId(value['jobId']) &&
        Array.isArray(value['items']) &&
        value['items'].length <= MAX_APPLY_ITEMS &&
        value['items'].every(isApplyItem)
      );
    default:
      return false;
  }
}

function isApplyItem(value: unknown): value is AiApplyItem {
  return (
    isRecord(value) &&
    isEntryId(value['entryId']) &&
    isText(value['value']) &&
    // The text the cell showed comes from the file, which may hold a cut-off character; it is only compared.
    (value['before'] === null || isBounded(value['before']))
  );
}
