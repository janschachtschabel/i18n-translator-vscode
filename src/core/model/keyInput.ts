import { keyFromSegments, type EntryKey } from './keys';

/**
 * A key as the user types it: its segments joined by dots, with a dot inside a segment written as `\.` and a
 * backslash as `\\`, so that `CCMAIL` › `mail.smtp.server` stays two segments and not four.
 */
export function keyInput(key: EntryKey): string {
  return key.segments.map((segment) => segment.replace(/[\\.]/g, (char) => `\\${char}`)).join('.');
}

/**
 * The key the user typed (see {@link keyInput}); any other backslash counts as itself. Empty segments stay:
 * the checks of a new key refuse them with a message that says what a key needs.
 */
export function parseKeyInput(text: string): EntryKey {
  const segments: string[] = [];
  let segment = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    const next = text[index + 1];
    if (char === '\\' && (next === '.' || next === '\\')) {
      segment += next;
      index++;
    } else if (char === '.') {
      segments.push(segment);
      segment = '';
    } else {
      segment += char;
    }
  }
  segments.push(segment);
  return keyFromSegments(segments);
}
