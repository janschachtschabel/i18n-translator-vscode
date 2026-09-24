/** Replaces `length` characters at `offset` with `content`; offsets refer to the text before any edit. */
export interface TextEdit {
  offset: number;
  length: number;
  content: string;
}

/** Applies edits given against the same text, in any order. Overlapping edits or edits outside the text throw. */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => a.offset - b.offset || a.length - b.length);
  let result = '';
  let position = 0;
  for (const edit of sorted) {
    if (edit.offset < position || edit.length < 0 || edit.offset + edit.length > text.length) {
      throw new RangeError(
        `Edit at ${edit.offset} (length ${edit.length}) overlaps another edit or leaves the text.`,
      );
    }
    result += text.slice(position, edit.offset) + edit.content;
    position = edit.offset + edit.length;
  }
  return result + text.slice(position);
}
