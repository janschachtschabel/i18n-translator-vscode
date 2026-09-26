import { keyFromSegments } from '../../model/keys';
import { VALUE_FIELD } from '../../model/types';
import type { FileProblem, ParsedEntry, ParsedFile, TextRange } from '../adapter';

/** One key-value line of a .properties file with its positions in the text. */
export interface Definition {
  key: string;
  value: string;
  /** Start of the first physical line, including its leading white space. */
  lineStart: number;
  keyRange: TextRange;
  /** From the first character of the value to the end of the logical line, without its line break. */
  valueRange: TextRange;
  /** After the line break of the last physical line; the end of the text if there is none. */
  lineEnd: number;
}

export type ReadResult = { ok: true; definitions: Definition[] } | { ok: false; problem: FileProblem };

/** The white space of java.util.Properties: not every Unicode space. */
const WHITE_SPACE = ' \t\f';

/** Escapes for control characters; any other escaped character stands for itself. */
const CONTROL_ESCAPES: Readonly<Record<string, string>> = { t: '\t', n: '\n', r: '\r', f: '\f' };

/** A logical line: its physical lines joined the way Java joins them. */
interface LogicalLine {
  content: string;
  /** Where the logical line begins, after the white space of its first physical line. */
  start: number;
  /** Offset in the text of every character of `content`. */
  offsets: number[];
  /** End of the last physical line, before its line break. */
  end: number;
  /** After that line break. */
  next: number;
}

/**
 * Entries, problems and keys of a .properties text, read like `java.util.Properties.load`. A key is one segment:
 * its dots belong to the name. With repeated keys, the last definition wins at the position of the first.
 */
export function parseProperties(text: string): ParsedFile {
  const read = readDefinitions(text);
  if (!read.ok) {
    return { entries: [], problems: [read.problem], topLevelKeys: [] };
  }
  const entries = new Map<string, ParsedEntry>();
  const problems: FileProblem[] = [];
  for (const definition of read.definitions) {
    const key = keyFromSegments([definition.key]);
    if (entries.has(key.id)) {
      problems.push({ code: 'duplicate-key', range: definition.keyRange, key });
    }
    entries.set(key.id, {
      key,
      fields: {
        [VALUE_FIELD]: {
          value: definition.value,
          keyRange: definition.keyRange,
          valueRange: definition.valueRange,
        },
      },
    });
  }
  const list = [...entries.values()];
  return { entries: list, problems, topLevelKeys: list.map((entry) => entry.key.segments[0]!) };
}

/**
 * Every key-value line in text order, repetitions included. A malformed `\u` escape makes Java refuse the whole
 * file, so reading stops there with a syntax error.
 */
export function readDefinitions(text: string): ReadResult {
  const definitions: Definition[] = [];
  let position = 0;
  while (position < text.length) {
    const lineStart = position;
    const start = skipWhiteSpace(text, position);
    const end = physicalLineEnd(text, start);
    if (start === end || text[start] === '#' || text[start] === '!') {
      position = afterLineBreak(text, end);
      continue;
    }
    const line = logicalLine(text, start, end);
    if ('restart' in line) {
      position = line.restart;
      continue;
    }
    const definition = splitLine(line, lineStart);
    if ('problem' in definition) {
      return { ok: false, problem: definition.problem };
    }
    definitions.push(definition);
    position = line.next;
  }
  return { ok: true, definitions };
}

/**
 * Joins a line that ends in an odd number of backslashes with the next one, without that backslash and the
 * leading white space of the next line. A comment sign there belongs to the text; an empty next line ends the
 * logical line. A backslash at the end of the text continues nothing and is dropped.
 *
 * A line of only a backslash leaves nothing joined, so Java 9+ still stands at the start of a logical line: the
 * next line is read anew, blank or comment lines included (`restart`). Only at the end of the text does it make
 * an entry, with an empty key.
 */
function logicalLine(text: string, start: number, end: number): LogicalLine | { restart: number } {
  let content = '';
  const offsets: number[] = [];
  let from = start;
  let to = end;
  for (;;) {
    const next = afterLineBreak(text, to);
    const continued = endsInOddBackslashes(text, from, to);
    for (let index = from; index < (continued ? to - 1 : to); index++) {
      content += text[index];
      offsets.push(index);
    }
    if (!continued || next >= text.length) {
      return { content, start, offsets, end: to, next };
    }
    if (content === '') {
      return { restart: next };
    }
    from = skipWhiteSpace(text, next);
    to = physicalLineEnd(text, from);
  }
}

/** The key ends at the first unescaped `=`, `:` or white space; one `=` or `:` and white space follow. */
function splitLine(line: LogicalLine, lineStart: number): Definition | { problem: FileProblem } {
  const { content, offsets } = line;
  let keyLength = 0;
  let valueStart = content.length;
  let hasSeparator = false;
  let escaped = false;
  while (keyLength < content.length) {
    const char = content[keyLength]!;
    if (!escaped && (char === '=' || char === ':' || WHITE_SPACE.includes(char))) {
      valueStart = keyLength + 1;
      hasSeparator = char === '=' || char === ':';
      break;
    }
    escaped = char === '\\' ? !escaped : false;
    keyLength++;
  }
  while (valueStart < content.length) {
    const char = content[valueStart]!;
    if (!WHITE_SPACE.includes(char)) {
      if (hasSeparator || (char !== '=' && char !== ':')) {
        break;
      }
      hasSeparator = true;
    }
    valueStart++;
  }

  const key = unescape(line, 0, keyLength);
  const value = unescape(line, valueStart, content.length);
  if (typeof key !== 'string') {
    return key;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const keyStart = offsets[0] ?? line.start;
  // An empty value begins right after the last character read: a backslash Java dropped at the end is replaced
  // with the value instead of turning its first letter into an escape.
  const afterContent = content.length > 0 ? offsets[content.length - 1]! + 1 : line.start;
  return {
    key,
    value,
    lineStart,
    keyRange: [keyStart, keyLength > 0 ? offsets[keyLength - 1]! + 1 : keyStart],
    valueRange: [valueStart < content.length ? offsets[valueStart]! : afterContent, line.end],
    lineEnd: line.next,
  };
}

/** The characters of `content[from, to)` with escapes resolved, like Java's `loadConvert`. */
function unescape(line: LogicalLine, from: number, to: number): string | { problem: FileProblem } {
  const { content, offsets } = line;
  let result = '';
  for (let index = from; index < to; index++) {
    const char = content[index]!;
    if (char !== '\\') {
      result += char;
      continue;
    }
    const escapeStart = index;
    // A line never ends in an unpaired backslash (it continues the line or is dropped), so `code` exists.
    const code = content[++index]!;
    if (code !== 'u') {
      result += CONTROL_ESCAPES[code] ?? code;
      continue;
    }
    const digits = content.slice(index + 1, index + 5);
    if (!/^[0-9a-fA-F]{4}$/.test(digits) || index + 5 > to) {
      const last = Math.min(escapeStart + 6, to) - 1;
      return {
        problem: {
          code: 'parse-error',
          range: [offsets[escapeStart]!, offsets[last]! + 1],
          detail: 'MalformedUnicodeEscape',
        },
      };
    }
    result += String.fromCharCode(parseInt(digits, 16));
    index += 4;
  }
  return result;
}

/** Whether `text[from, to)` ends in an odd run of backslashes, which continues the line in Java. */
export function endsInOddBackslashes(text: string, from: number, to: number): boolean {
  let count = 0;
  while (to - count > from && text[to - count - 1] === '\\') {
    count++;
  }
  return count % 2 === 1;
}

function skipWhiteSpace(text: string, from: number): number {
  let index = from;
  while (index < text.length && WHITE_SPACE.includes(text[index]!)) {
    index++;
  }
  return index;
}

/** The position of the next line break (`\r` or `\n`), or the end of the text. */
function physicalLineEnd(text: string, from: number): number {
  let index = from;
  while (index < text.length && text[index] !== '\n' && text[index] !== '\r') {
    index++;
  }
  return index;
}

/** The position after the line break at `at` (`\r\n`, `\r` or `\n`); `at` itself if there is none. */
function afterLineBreak(text: string, at: number): number {
  if (text[at] === '\r') {
    return text[at + 1] === '\n' ? at + 2 : at + 1;
  }
  return text[at] === '\n' ? at + 1 : at;
}
