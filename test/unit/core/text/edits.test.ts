import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/text/edits';

describe('applyEdits', () => {
  it('returns the text unchanged without edits', () => {
    expect(applyEdits('abc', [])).toBe('abc');
  });

  it('applies replacements, insertions and deletions against the original offsets', () => {
    const edits = [
      { offset: 0, length: 1, content: 'X' },
      { offset: 3, length: 0, content: '-' },
      { offset: 4, length: 2, content: '' },
    ];
    expect(applyEdits('abcdefg', edits)).toBe('Xbc-dg');
  });

  it('does not depend on the order of the edits', () => {
    const edits = [
      { offset: 4, length: 2, content: '' },
      { offset: 0, length: 1, content: 'X' },
    ];
    expect(applyEdits('abcdefg', edits)).toBe('Xbcdg');
  });

  it('allows adjacent edits', () => {
    expect(
      applyEdits('abcd', [
        { offset: 0, length: 2, content: 'x' },
        { offset: 2, length: 2, content: 'y' },
      ]),
    ).toBe('xy');
  });

  it('rejects overlapping edits and edits outside the text', () => {
    expect(() =>
      applyEdits('abcd', [
        { offset: 0, length: 3, content: 'x' },
        { offset: 2, length: 1, content: 'y' },
      ]),
    ).toThrow(RangeError);
    expect(() => applyEdits('abcd', [{ offset: 3, length: 2, content: 'x' }])).toThrow(RangeError);
    expect(() => applyEdits('abcd', [{ offset: -1, length: 0, content: 'x' }])).toThrow(RangeError);
  });
});
