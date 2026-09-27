export interface Position {
  /** Zero-based line. */
  line: number;
  /** Zero-based offset within the line, in UTF-16 code units (like VS Code). */
  character: number;
}

export interface LineIndex {
  positionAt(offset: number): Position;
}

const LF = 10;
const CR = 13;

/** Where the line of `offset` starts: after the last \n or lone \r before it (a \r\n ends one line). */
export function lineStartAt(text: string, offset: number): number {
  // Back to the line break before, not further: lastIndexOf('\r') searched a text without one back to its start, and
  // writers ask for many lines of one text.
  let start = Math.min(offset, text.length);
  while (start > 0) {
    const unit = text.charCodeAt(start - 1);
    if (unit === LF || unit === CR) {
      break;
    }
    start--;
  }
  return start;
}

/** White space within a line. */
const BLANK = /[^\S\r\n]/;

/** Where the blanks before `offset` begin: a walk back over them, not to the start of a long line. */
export function blanksBefore(text: string, offset: number): number {
  let index = offset;
  while (index > 0 && BLANK.test(text[index - 1]!)) {
    index--;
  }
  return index;
}

/** Where the blanks from `offset` on end: at the next line break, other character or the end of the text. */
export function blanksAfter(text: string, offset: number): number {
  let index = offset;
  while (index < text.length && BLANK.test(text[index]!)) {
    index++;
  }
  return index;
}

/** Whether a line starts at `index`: at the start of the text or after a line break. */
export function atLineStart(text: string, index: number): boolean {
  return index === 0 || text.charCodeAt(index - 1) === LF || text.charCodeAt(index - 1) === CR;
}

/** Maps text offsets to line/character positions; \n, \r\n and a lone \r end a line, as in VS Code. */
export function createLineIndex(text: string): LineIndex {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) {
      lineStarts.push(i + 1);
    }
  }

  return {
    positionAt(offset: number): Position {
      const clamped = Math.min(Math.max(offset, 0), text.length);
      let low = 0;
      let high = lineStarts.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (lineStarts[mid]! <= clamped) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      return { line: low, character: clamped - lineStarts[low]! };
    },
  };
}
