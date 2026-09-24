import { describe, expect, it } from 'vitest';
import { createLineIndex } from '../../../../src/core/text/lineIndex';

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
