import { describe, expect, it } from 'vitest';
import {
  atLineEnd,
  atLineStart,
  blanksAfter,
  blanksBefore,
  createLineIndex,
  lineStartAt,
} from '../../../../src/core/text/lineIndex';

describe('lineStartAt', () => {
  it('finds the start of the line after \\n, \\r\\n or a lone \\r', () => {
    const text = 'a\nb\r\nc\rd';
    expect([0, 1, 2, 3, 5, 6, 7, 8].map((offset) => lineStartAt(text, offset))).toEqual([
      0, 0, 2, 2, 5, 5, 7, 7,
    ]);
  });

  // lastIndexOf(char, -1) searches index 0: offset 0 of a text that starts with a line break gave 1 (audit L-30).
  it('puts offset 0 on the first line, also when the text starts with a line break', () => {
    for (const lineBreak of [10, 13]) {
      expect(lineStartAt(`${String.fromCharCode(lineBreak)}abc`, 0)).toBe(0);
    }
  });

  // Looking for the last \r searched a text without one back to its start, at each call: removing a key defined 8,000
  // times in a JSON file of 240 KB still took 2.5 s (audit S-14).
  it('looks back only to the line break before, also in a text without carriage returns', () => {
    const line = `${'x'.repeat(49)}${String.fromCharCode(10)}`;
    const text = line.repeat(20_000);
    // Only the calls are timed: 20,000 assertions in the loop took half a second in a full run of the suite.
    const starts: number[] = [];
    const started = performance.now();
    for (let offset = line.length - 1; offset < text.length; offset += line.length) {
      starts.push(lineStartAt(text, offset));
    }
    const elapsed = performance.now() - started;
    expect(starts.every((start, index) => start === index * line.length)).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });

  it('takes the end of the text for an offset beyond it', () => {
    expect(lineStartAt('ab\ncd', 99)).toBe(3);
    expect(lineStartAt('ab\n', 99)).toBe(3);
    expect(lineStartAt('ab', 99)).toBe(0);
  });
});

describe('blanksBefore, blanksAfter and atLineStart', () => {
  const NBSP = String.fromCharCode(0xa0);

  it('walk over the white space of a line only, and stop at a line break', () => {
    const text = `a\n \t${NBSP}b${NBSP} \r\nc`;
    expect(blanksBefore(text, 5)).toBe(2);
    expect(atLineStart(text, 2)).toBe(true);
    expect(blanksAfter(text, 6)).toBe(8);
    expect(text[8]).toBe('\r');
  });

  it('say where a line starts: at the start of the text, after LF or CR, and nowhere else', () => {
    expect([0, 1, 2, 3, 4].map((index) => atLineStart('a\nb\rc', index))).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(blanksBefore('  x', 2)).toBe(0);
    expect(blanksBefore('a x', 2)).toBe(1);
    expect(atLineStart('a x', 1)).toBe(false);
  });

  it('say where a line ends: at LF or CR, at the end of the text, and nowhere else', () => {
    expect([0, 1, 2, 3, 4, 5].map((index) => atLineEnd('a\nb\rc', index))).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
  });
});

describe('createLineIndex', () => {
  it('maps offsets to zero-based line and character', () => {
    const index = createLineIndex('a\nbc\r\nd');
    expect(index.positionAt(0)).toEqual({ line: 0, character: 0 });
    expect(index.positionAt(2)).toEqual({ line: 1, character: 0 });
    expect(index.positionAt(3)).toEqual({ line: 1, character: 1 });
    expect(index.positionAt(6)).toEqual({ line: 2, character: 0 });
    expect(index.positionAt(7)).toEqual({ line: 2, character: 1 });
  });

  it('treats a lone carriage return as a line break, like VS Code', () => {
    expect(createLineIndex('a\rb').positionAt(2)).toEqual({ line: 1, character: 0 });
  });

  it('clamps offsets outside the text', () => {
    const index = createLineIndex('ab');
    expect(index.positionAt(-1)).toEqual({ line: 0, character: 0 });
    expect(index.positionAt(100)).toEqual({ line: 0, character: 2 });
  });

  it('handles empty text', () => {
    expect(createLineIndex('').positionAt(0)).toEqual({ line: 0, character: 0 });
  });
});
