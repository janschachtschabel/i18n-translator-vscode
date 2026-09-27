import { keyFromId } from '../core/model/keys';

/**
 * Checks of the fields of messages from a webview, which is a separate context: nothing it sends is trusted, so every
 * field is checked for its type and bounded before the host uses it.
 */

/** Longest text an edit may carry; translations are far shorter, this only bounds a runaway message. */
export const MAX_TEXT_LENGTH = 100_000;
const MAX_ID_LENGTH = 200;
/** Entry ids, bundle ids and folder URIs: far longer than real ones, but bounded before they are parsed. */
const MAX_LONG_ID_LENGTH = 10_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/** Text a user typed: bounded, and without incomplete characters, which no file could store faithfully. */
export function isText(value: unknown): value is string {
  return isBounded(value) && !/\p{Cs}/u.test(value);
}

export function isBounded(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;
}

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return (values as readonly unknown[]).includes(value);
}

export function isEntryId(value: unknown): value is string {
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

export function isLongId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_LONG_ID_LENGTH;
}

/** The JSON tuple of area id, root and name that `buildBundle` makes, in exactly its spelling. */
export function isBundleId(value: unknown): value is string {
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
