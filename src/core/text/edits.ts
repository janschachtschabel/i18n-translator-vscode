/** Replaces `length` characters at `offset` with `content`; offsets refer to the text before any edit. */
export interface TextEdit {
  offset: number;
  length: number;
  content: string;
}

/**
 * Applies edits given against the same text, in any order; an insertion goes before a replacement at the same
 * offset. Throws a `RangeError` for overlapping edits, for two insertions at one offset (their order would be
 * ambiguous) and for edits outside the text.
 */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => a.offset - b.offset || a.length - b.length);
  let result = '';
  let position = 0;
  let insertedAt = -1;
  for (const edit of sorted) {
    const secondInsertion = edit.length === 0 && edit.offset === insertedAt;
    if (
      secondInsertion ||
      edit.offset < position ||
      edit.length < 0 ||
      edit.offset + edit.length > text.length
    ) {
      throw new RangeError(
        `Edit at ${edit.offset} (length ${edit.length}) overlaps another edit or leaves the text.`,
      );
    }
    result += text.slice(position, edit.offset) + edit.content;
    position = edit.offset + edit.length;
    insertedAt = edit.length === 0 ? edit.offset : -1;
  }
  return result + text.slice(position);
}
