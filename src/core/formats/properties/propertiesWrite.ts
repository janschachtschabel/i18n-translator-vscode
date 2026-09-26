import { displayKey, type EntryKey } from '../../model/keys';
import { applyEdits } from '../../text/edits';
import { detectStyle, type TextStyle } from '../../text/style';
import { EditError, type FileOp } from '../adapter';
import { endsInOddBackslashes, readDefinitions, type Definition } from './propertiesRead';

/**
 * Applies the operations one after another and re-reads the text in between. Only the lines of the affected keys
 * change: a new line takes the separator of its neighbor and the line break of the file. In a file with a byte
 * order mark (`bom`), Java reads the first line as part of an unreadable key, so no new key goes there.
 */
export function applyPropertiesOps(text: string, ops: readonly FileOp[], bom = false): string {
  const style = detectStyle(text);
  let current = text;
  for (const op of ops) {
    current = applyOp(current, op, style, bom);
  }
  return current;
}

function applyOp(text: string, op: FileOp, style: TextStyle, bom: boolean): string {
  switch (op.kind) {
    case 'set':
      return setValue(text, op.key, op.value);
    case 'insert':
      return insertLine(text, op.key, op.value, op.first ? 'first' : op.after, style, bom);
    case 'delete':
      return removeEvery(text, op.key, true);
    case 'rename':
      return renameKey(text, op.from, op.to);
  }
}

function setValue(text: string, key: EntryKey, value: string): string {
  const definition = lastDefinition(read(text), key);
  if (!definition) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`, key);
  }
  const [start, end] = definition.valueRange;
  const separator = text.slice(definition.keyRange[1], start);
  // A key without separator and value would swallow the new value.
  const content =
    separator === '' ? `=${escapeValue(value, true)}` : escapeValue(value, /[=:]/.test(separator));
  return applyEdits(text, [{ offset: start, length: end - start, content }]);
}

/**
 * A new line after the logical line of the anchor, before the first definition (`first`), or after the last one
 * when the anchor is missing; in a file without definitions at its end.
 */
function insertLine(
  text: string,
  key: EntryKey,
  value: string,
  place: EntryKey | 'first' | undefined,
  style: TextStyle,
  bom: boolean,
): string {
  const definitions = read(text);
  if (lastDefinition(definitions, key)) {
    throw new EditError('key-exists', `${displayKey(key)} already exists in this file.`, key);
  }
  const anchor =
    place === 'first'
      ? definitions[0]
      : ((place && lastDefinition(definitions, place)) ?? definitions[definitions.length - 1]);
  const name = nameOf(key);
  const found = (anchor && usableSeparator(text, anchor)) ?? firstUsableSeparator(text, definitions);
  // Java skips white space at the start of a line: an empty key needs `=` or `:` to keep its value a value.
  const separator = name === '' && !/[=:]/.test(found) ? '=' : found;
  const line = escapeKey(name) + separator + escapeValue(value, /[=:]/.test(separator));
  const eol = style.eol;
  if (!anchor) {
    const content = text === '' || /[\r\n]$/.test(text) ? line + eol : eol + line;
    return applyEdits(text, [{ offset: text.length, length: 0, content }]);
  }
  if (place === 'first' && !(bom && anchor.lineStart === 0)) {
    return applyEdits(text, [{ offset: anchor.lineStart, length: 0, content: line + eol }]);
  }
  // A backslash that ends the file continues nothing yet; a blank line keeps it from continuing into the new line.
  const blank = endsInOddBackslashes(text, anchor.lineStart, anchor.valueRange[1]) ? eol : '';
  // The last line of a file without a final line break keeps it that way.
  const content = hasLineBreak(anchor) ? blank + line + eol : eol + blank + line;
  return applyEdits(text, [{ offset: anchor.lineEnd, length: 0, content }]);
}

/** Renames the definition that applies; earlier ones of the old name were hidden by it and must not come back. */
function renameKey(text: string, from: EntryKey, to: EntryKey): string {
  const definitions = read(text);
  const definition = lastDefinition(definitions, from);
  if (!definition) {
    throw new EditError('missing-key', `${displayKey(from)} does not exist in this file.`, from);
  }
  if (nameOf(from) === nameOf(to)) {
    return text;
  }
  if (lastDefinition(definitions, to)) {
    throw new EditError('key-exists', `${displayKey(to)} already exists in this file.`, to);
  }
  const [start, end] = definition.keyRange;
  const renamed = applyEdits(text, [{ offset: start, length: end - start, content: escapeKey(nameOf(to)) }]);
  return removeEvery(renamed, from, false);
}

/** Removes every definition of the key with its lines; `required`: the key must be there. */
function removeEvery(text: string, key: EntryKey, required: boolean): string {
  let current = text;
  let definition = lastDefinition(read(current), key);
  if (!definition && required) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`, key);
  }
  while (definition) {
    current = removeLines(current, definition);
    definition = lastDefinition(read(current), key);
  }
  return current;
}

/** The lines of a definition; for a last line without line break, the line break before it goes instead. */
function removeLines(text: string, definition: Definition): string {
  let start = definition.lineStart;
  if (!hasLineBreak(definition) && start > 0) {
    start -= text.slice(0, start).endsWith('\r\n') ? 2 : 1;
  }
  return applyEdits(text, [{ offset: start, length: definition.lineEnd - start, content: '' }]);
}

function read(text: string): Definition[] {
  const result = readDefinitions(text);
  if (!result.ok) {
    throw new EditError('unparsable', 'The file has a malformed \\u escape.');
  }
  return result.definitions;
}

function lastDefinition(definitions: readonly Definition[], key: EntryKey): Definition | undefined {
  const name = nameOf(key);
  return definitions.filter((definition) => definition.key === name).at(-1);
}

/** The keys of .properties files are flat: one segment, dots included. */
function nameOf(key: EntryKey): string {
  if (key.segments.length !== 1) {
    throw new RangeError(`A .properties key has one segment: ${displayKey(key)}`);
  }
  return key.segments[0]!;
}

function hasLineBreak(definition: Definition): boolean {
  return definition.lineEnd > definition.valueRange[1];
}

/** The separator as written between key and value, if it lies on one line and exists. */
function usableSeparator(text: string, definition: Definition): string | undefined {
  const separator = text.slice(definition.keyRange[1], definition.valueRange[0]);
  return separator !== '' && !/[\r\n]/.test(separator) ? separator : undefined;
}

function firstUsableSeparator(text: string, definitions: readonly Definition[]): string {
  for (const definition of definitions) {
    const separator = usableSeparator(text, definition);
    if (separator) {
      return separator;
    }
  }
  return '=';
}

const BACKSLASH = '\\';
const CONTROL_ESCAPES: Readonly<Record<string, string>> = {
  '\t': '\\t',
  '\n': '\\n',
  '\r': '\\r',
  '\f': '\\f',
  // Line and paragraph separators, which editors offer to remove, as escapes Java reads exactly.
  [String.fromCharCode(0x2028)]: `${BACKSLASH}u2028`,
  [String.fromCharCode(0x2029)]: `${BACKSLASH}u2029`,
};

/** Like `Properties.store`: white space, separators and comment signs are escaped anywhere in a key. */
function escapeKey(name: string): string {
  let result = '';
  for (const char of name) {
    result += CONTROL_ESCAPES[char] ?? (/[\\ =:#!]/.test(char) ? `\\${char}` : char);
  }
  return result;
}

/**
 * Backslashes and control characters are escaped, a leading space too (Java skips it), and a leading `=` or `:`
 * where only white space separates key and value (Java would take it as the separator).
 */
function escapeValue(value: string, separatorHasSign: boolean): string {
  let result = '';
  let first = true;
  for (const char of value) {
    const leading = first && (char === ' ' || (!separatorHasSign && (char === '=' || char === ':')));
    result += CONTROL_ESCAPES[char] ?? (char === '\\' || leading ? `\\${char}` : char);
    first = false;
  }
  return result;
}
