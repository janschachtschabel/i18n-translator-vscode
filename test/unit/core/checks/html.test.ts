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

  it('treats words in angle brackets as text (edu-sharing "<keine>", "<sonstige>")', () => {
    expect(tagSignature('<keine>')).toEqual([]);
    expect(compareTags('Autor: <keine>', 'Author: <not set>')).toEqual({ missing: [], extra: [] });
  });

  it('reads a tag name only up to the next character that cannot belong to it', () => {
    expect(tagSignature('<b.x>a</b><i_x>')).toEqual(['/b', 'b']);
  });

  // Texts come from the repository: an unclosed tag must not make the check quadratic (audit S-02).
  it('scans a long unclosed tag in linear time', () => {
    const started = performance.now();
    expect(tagSignature(`<a${'-a'.repeat(50_000)}`)).toEqual([]);
    expect(tagSignature(`<a${' a'.repeat(50_000)}`)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(500);
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
