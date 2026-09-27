import { displayKey, type EntryKey } from '../../model/keys';
import { applyEdits, type TextEdit } from '../../text/edits';
import { detectStyle, type TextStyle } from '../../text/style';
import { EditError, type FileOp } from '../adapter';
import { endsInOddBackslashes, readDefinitions, type Definition } from './propertiesRead';

/** A text with its definitions, kept up to date through the operations of a batch. */
interface File {
  text: string;
  definitions: Definition[];
}

/**
 * Applies the operations one after another, each on the text the ones before left. Only the lines of the affected
 * keys change: a new line takes the separator of its neighbor and the line break of the file. In a file with a byte
 * order mark (`bom`), Java reads the first line as part of an unreadable key, so no new key goes there.
 */
export function applyPropertiesOps(text: string, ops: readonly FileOp[], bom = false): string {
  if (ops.length === 0) {
    return text;
  }
  const style = detectStyle(text);
  // Read once, then kept up to date: reading the whole text again after each of a fill's texts took seconds.
  let file: File = { text, definitions: read(text) };
  for (const op of ops) {
    file = applyOp(file, op, style, bom);
  }
  return file.text;
}

function applyOp(file: File, op: FileOp, style: TextStyle, bom: boolean): File {
  switch (op.kind) {
    case 'set':
      return setValue(file, op.key, op.value);
    case 'insert':
      return insertLine(file, op.key, op.value, op.first ? 'first' : op.after, style, bom);
    case 'delete':
      return readAgain(removeEvery(file.text, op.key, true, bom));
    case 'rename':
      return readAgain(renameKey(file.text, op.from, op.to, bom));
  }
}

function readAgain(text: string): File {
  return { text, definitions: read(text) };
}

/**
 * The file after an edit within the lines from `start` to `end`, which begin and end logical lines: the definitions
 * before them stay, those after them move, and the edited lines are read on their own.
 */
function edited(file: File, edit: TextEdit, start: number, end: number): File {
  const text = applyEdits(file.text, [edit]);
  const delta = edit.content.length - edit.length;
  // A CR at the end and an LF after it are one line break, which the edit may have joined: read them together.
  const until = text[end + delta - 1] === '\r' && text[end + delta] === '\n' ? end + delta + 1 : end + delta;
  const lines = read(text.slice(start, until)).map((definition) => moved(definition, start));
  return {
    text,
    definitions: [
      ...file.definitions.filter((definition) => definition.lineStart < start),
      ...lines,
      ...file.definitions
        .filter((definition) => definition.lineStart >= end)
        .map((definition) => moved(definition, delta)),
    ],
  };
}

function moved(definition: Definition, delta: number): Definition {
  return {
    ...definition,
    lineStart: definition.lineStart + delta,
    keyRange: [definition.keyRange[0] + delta, definition.keyRange[1] + delta],
    valueRange: [definition.valueRange[0] + delta, definition.valueRange[1] + delta],
    lineEnd: definition.lineEnd + delta,
  };
}

function setValue(file: File, key: EntryKey, value: string): File {
  const { text } = file;
  const definition = lastDefinition(file.definitions, key);
  if (!definition) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`, key);
  }
  const [start, end] = definition.valueRange;
  const separator = text.slice(definition.keyRange[1], start);
  // A key without separator and value would swallow the new value.
  const content =
    separator === '' ? `=${escapeValue(value, true)}` : escapeValue(value, /[=:]/.test(separator));
  return edited(
    file,
    { offset: start, length: end - start, content },
    definition.lineStart,
    definition.lineEnd,
  );
}

/**
 * A new line after the logical line of the anchor, before the first definition (`first`), or after the last one
 * when the anchor is missing; in a file without definitions at its end.
 */
function insertLine(
  file: File,
  key: EntryKey,
  value: string,
  place: EntryKey | 'first' | undefined,
  style: TextStyle,
  bom: boolean,
): File {
  const { text, definitions } = file;
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
    // In an empty file with a byte order mark, the first line stays free: Java reads the mark as part of its key.
    const content =
      text === '' ? (bom ? eol : '') + line + eol : /[\r\n]$/.test(text) ? line + eol : eol + line;
    return edited(file, { offset: text.length, length: 0, content }, text.length, text.length);
  }
  if (place === 'first' && !(bom && anchor.lineStart === 0)) {
    return edited(
      file,
      { offset: anchor.lineStart, length: 0, content: line + eol },
      anchor.lineStart,
      anchor.lineStart,
    );
  }
  // A backslash that ends the file continues nothing yet; a blank line keeps it from continuing into the new line.
  // After a CR, the blank line breaks with a CR too: an LF would join the CR to one line break.
  const afterCr = text[anchor.lineEnd - 1] === '\r' && eol === '\n';
  const blank = endsInOddBackslashes(text, anchor.lineStart, anchor.valueRange[1])
    ? afterCr
      ? '\r'
      : eol
    : '';
  // The last line of a file without a final line break keeps it that way.
  const content = hasLineBreak(anchor) ? blank + line + eol : eol + blank + line;
  return edited(file, { offset: anchor.lineEnd, length: 0, content }, anchor.lineStart, anchor.lineEnd);
}

/** Renames the definition that applies; earlier ones of the old name were hidden by it and must not come back. */
function renameKey(text: string, from: EntryKey, to: EntryKey, bom: boolean): string {
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
  return removeEvery(renamed, from, false, bom);
}

/** Removes every definition of the key with its lines; `required`: the key must be there. */
function removeEvery(text: string, key: EntryKey, required: boolean, bom: boolean): string {
  const name = nameOf(key);
  const definitions = read(text).filter((definition) => definition.key === name);
  if (definitions.length === 0 && required) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`, key);
  }
  // From the last to the first, on one reading: a removal changes nothing before it but the line break that a last
  // line without one takes from the line before, which removeLines reads in the text as it is then. Reading the file
  // again after each removal took quadratic time (audit S-14).
  let current = text;
  for (const definition of definitions.reverse()) {
    current = removeLines(current, definition, bom);
  }
  return current;
}

/**
 * The lines of a definition; for a last line without line break, the line break before it goes instead. In a file
 * with a byte order mark, the first line stays, empty: the next key would take the mark (audit L-25).
 */
function removeLines(text: string, definition: Definition, bom: boolean): string {
  // The line break after the definition as the text has it now: a removal after it may have taken it.
  const end = definition.valueRange[1];
  const lineBreak = text.startsWith('\r\n', end) ? 2 : text[end] === '\n' || text[end] === '\r' ? 1 : 0;
  if (bom && definition.lineStart === 0 && lineBreak > 0) {
    return applyEdits(text, [{ offset: 0, length: end, content: '' }]);
  }
  let start = definition.lineStart;
  if (lineBreak === 0 && start > 0) {
    start -= text.startsWith('\r\n', start - 2) ? 2 : 1;
  }
  return applyEdits(text, [{ offset: start, length: end + lineBreak - start, content: '' }]);
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
