import { describe, expect, it } from 'vitest';
import { compareTags, tagSignature } from '../../../../src/core/checks/html';

describe('tagSignature', () => {
  it('lists opening and closing tags, sorted', () => {
    expect(tagSignature('<b>x</b><br>')).toEqual(['/b', 'b', 'br']);
  });

  it('ignores attributes, letter case and self-closing slashes', () => {
    expect(tagSignature('<a href="x">y</a><BR/>')).toEqual(tagSignature('<A class="z">y</A><br>'));
  });

  it('does not mistake comparisons for tags', () => {
    expect(tagSignature('a < b und c > d')).toEqual([]);
  });
});

describe('compareTags', () => {
  it('reports tags missing from and added to the translation', () => {
    expect(compareTags('Bitte <b>vorsichtig</b> sein', 'Soyez prudent<br>')).toEqual({
      missing: ['/b', 'b'],
      extra: ['br'],
    });
  });

  it('counts repeated tags', () => {
    expect(compareTags('<br><br>', '<br>')).toEqual({ missing: ['br'], extra: [] });
  });

  it('accepts reordered tags', () => {
    expect(compareTags('<i>a</i> <b>b</b>', '<b>b</b> <i>a</i>')).toEqual({ missing: [], extra: [] });
  });
});
