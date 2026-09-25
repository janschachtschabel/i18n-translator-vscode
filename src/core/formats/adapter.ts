import type { FormatId } from '../area/areaDefinition';
import type { EntryKey } from '../model/keys';
import type { FieldId } from '../model/types';
import type { DecodedText } from '../text/decode';
import type { TextStyle } from '../text/style';

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

/** A change of one entry; the adapter decides how it looks in its format. Only the field `value` so far. */
export type FileOp =
  | { kind: 'set'; key: EntryKey; value: string }
  /** `after` names a sibling in the same object; without one (or if it is elsewhere) the entry goes last. */
  | { kind: 'insert'; key: EntryKey; value: string; after?: EntryKey }
  /** Objects that become empty are removed as well, except the top level. */
  | { kind: 'delete'; key: EntryKey }
  | { kind: 'rename'; from: EntryKey; to: EntryKey };

export type EditErrorCode = 'missing-key' | 'key-exists' | 'path-conflict' | 'unparsable';

/** An operation that does not fit the file, e.g. setting a key the file does not have. */
export class EditError extends Error {
  constructor(
    readonly code: EditErrorCode,
    message: string,
    /**
     * The key of the operation (for a rename: `from` when it is missing or not a text, `to` when the target is
     * taken or blocked); undefined when the file cannot be read at all.
     */
    readonly key?: EntryKey,
    /** For a path conflict: the path in the way, e.g. the text `A` for a new `A.B`. */
    readonly other?: EntryKey,
  ) {
    super(message);
    this.name = 'EditError';
  }
}

/** Reads and writes one file format without touching anything an operation does not ask for. */
export interface FormatAdapter {
  readonly id: FormatId;
  decode(bytes: Uint8Array): DecodedText;
  parse(doc: DecodedText): ParsedFile;
  /** Applies the operations in order; encoding and byte order mark stay. Throws {@link EditError}. */
  applyOps(doc: DecodedText, ops: readonly FileOp[]): DecodedText;
  encode(doc: DecodedText): Uint8Array;
  /** Content of a new, empty file. */
  createEmpty(style?: TextStyle): string;
}

export function hasSyntaxError(parsed: ParsedFile): boolean {
  return parsed.problems.some((problem) => problem.code === 'parse-error');
}
