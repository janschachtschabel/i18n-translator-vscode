import { keyFromId } from '../core/model/keys';
import type { BundleViewModel } from './viewModel';

/** How the editor shows a bundle; the host keeps it per bundle in workspaceState (B7). */
export interface UiState {
  layout: 'auto' | 'table' | 'list';
  /** Long texts wrap onto several lines instead of being cut off. */
  wrap: boolean;
  hiddenLocales: readonly string[];
}

export const DEFAULT_UI_STATE: UiState = { layout: 'auto', wrap: false, hiddenLocales: [] };

/** What the webview keeps (`setState`) so that VS Code can restore the editor after a restart. */
export interface PanelState {
  /** The workspace folder, as `Uri.toString()`. */
  folder: string;
  bundleId: string;
}

export type EditorCommand = 'addKey' | 'renameKey' | 'deleteKey' | 'addLanguage';

/** What the webview asks of the host. The host checks every message with {@link isWebviewToHost}. */
export type WebviewToHost =
  | { type: 'ready' }
  /** `before` is the text the cell showed (null: none); a different text on disk is a conflict (B5). */
  | { type: 'edit'; requestId: string; entryId: string; locale: string; value: string; before: string | null }
  /** The host asks for names and confirmations itself; `entryId` is the key the command starts from. */
  | { type: 'command'; command: EditorCommand; entryId?: string }
  | { type: 'uiState'; state: UiState }
  | { type: 'undo' };

/** What the host sends; it builds these itself, so the webview does not check them. */
export type HostToWebview =
  /** `l10n`: the texts of the editor in the user's language, keyed by their English text. */
  | { type: 'init'; l10n: Readonly<Record<string, string>>; uiState: UiState; panelState: PanelState }
  | { type: 'bundle'; model: BundleViewModel }
  /** The bundle is not in the index (any more), e.g. after a restart or a branch switch. */
  | { type: 'missing'; name: string }
  /** `message`: why the write failed, in the user's language. */
  | { type: 'writeResult'; requestId: string; ok: boolean; message?: string };

/** Longest text an edit may carry; translations are far shorter, this only bounds a runaway message. */
export const MAX_TEXT_LENGTH = 100_000;
const MAX_ID_LENGTH = 200;
/** Entry ids, bundle ids and folder URIs: far longer than real ones, but bounded before they are parsed. */
const MAX_LONG_ID_LENGTH = 10_000;
const MAX_HIDDEN_LOCALES = 200;

const LAYOUTS: readonly string[] = ['auto', 'table', 'list'];
const COMMANDS: readonly string[] = ['addKey', 'renameKey', 'deleteKey', 'addLanguage'];

/**
 * Whether a message from the webview has a known type and valid fields. The webview is a separate context:
 * nothing it sends is trusted, so unknown or malformed messages are dropped by the caller.
 */
export function isWebviewToHost(value: unknown): value is WebviewToHost {
  if (!isRecord(value)) {
    return false;
  }
  switch (value['type']) {
    case 'ready':
    case 'undo':
      return true;
    case 'edit':
      return (
        isId(value['requestId']) &&
        isEntryId(value['entryId']) &&
        isId(value['locale']) &&
        isText(value['value']) &&
        (value['before'] === null || isText(value['before']))
      );
    case 'command':
      return (
        COMMANDS.includes(value['command'] as string) &&
        (value['entryId'] === undefined || isEntryId(value['entryId']))
      );
    case 'uiState':
      return isUiState(value['state']);
    default:
      return false;
  }
}

/** Whether a state that VS Code kept for a webview is one the host gave it; it comes back from the webview. */
export function isPanelState(value: unknown): value is PanelState {
  return isRecord(value) && isLongId(value['folder']) && isBundleId(value['bundleId']);
}

/** Whether a view state is complete and valid; the host also reads it back from the workspace state. */
export function isUiState(value: unknown): value is UiState {
  if (!isRecord(value)) {
    return false;
  }
  const hidden = value['hiddenLocales'];
  return (
    LAYOUTS.includes(value['layout'] as string) &&
    typeof value['wrap'] === 'boolean' &&
    Array.isArray(hidden) &&
    hidden.length <= MAX_HIDDEN_LOCALES &&
    hidden.every(isId)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/** Text a user typed: bounded, and without incomplete characters, which no file could store faithfully. */
function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH && !/\p{Cs}/u.test(value);
}

function isEntryId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_LONG_ID_LENGTH) {
    return false;
  }
  try {
    keyFromId(value);
    return true;
  } catch {
    // keyFromId throws for anything that is not the id of a key with at least one segment.
    return false;
  }
}

function isLongId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_LONG_ID_LENGTH;
}

/** The JSON tuple of area id, root and name that `buildBundle` makes, in exactly its spelling. */
function isBundleId(value: unknown): value is string {
  if (!isLongId(value)) {
    return false;
  }
  try {
    const parts: unknown = JSON.parse(value);
    return (
      Array.isArray(parts) &&
      parts.length === 3 &&
      parts.every((part) => typeof part === 'string') &&
      JSON.stringify(parts) === value
    );
  } catch {
    // Not JSON at all.
    return false;
  }
}
