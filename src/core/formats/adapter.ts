import type { FormatId } from '../area/areaDefinition';
import type { EntryKey } from '../model/keys';
import type { FieldId } from '../model/types';
import type { DecodedText } from '../text/decode';

/** Offsets into {@link DecodedText.text}: start inclusive, end exclusive. */
export type TextRange = [start: number, end: number];

export interface ParsedField {
  value: string;
  valueRange: TextRange;
  keyRange: TextRange;
}

export interface ParsedEntry {
  key: EntryKey;
  fields: Record<FieldId, ParsedField>;
}

export type FileProblemCode = 'parse-error' | 'non-string-value' | 'duplicate-key' | 'not-utf8';

export interface FileProblem {
  code: FileProblemCode;
  range: TextRange;
  /** Machine-readable detail, e.g. the parser's error code. */
  detail?: string;
  key?: EntryKey;
}

export interface ParsedFile {
  /** Entries in file order. Empty when the file has a syntax error: a partial parse is not trustworthy. */
  entries: ParsedEntry[];
  problems: FileProblem[];
  /** Top-level keys in file order, including those without leaves (`"X": {}`). */
  topLevelKeys: string[];
}

/** Reads one file format. Write support is added in phase 2. */
export interface FormatAdapter {
  readonly id: FormatId;
  decode(bytes: Uint8Array): DecodedText;
  parse(doc: DecodedText): ParsedFile;
}

export function hasSyntaxError(parsed: ParsedFile): boolean {
  return parsed.problems.some((problem) => problem.code === 'parse-error');
}
