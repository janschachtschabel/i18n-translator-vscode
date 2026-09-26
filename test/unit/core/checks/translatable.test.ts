import { describe, expect, it } from 'vitest';
import { hasTextToTranslate } from '../../../../src/core/checks/translatable';

describe('hasTextToTranslate', () => {
  it('finds words, also next to links, placeholders and tags', () => {
    for (const text of [
      'Password reset',
      'PDF',
      'Ja',
      'See https://example.org/help',
      '<b>{{n}} files</b>',
    ]) {
      expect(hasTextToTranslate(text, undefined), text).toBe(true);
    }
  });

  it('finds none in links, numbers, placeholders and tags alone', () => {
    for (const text of [
      'http://creativecommons.org/licenses/by-nc/3.0/deed.en',
      'https://example.org/a?b=c https://example.org/d',
      '1.0',
      '{{count}}',
      '<br>',
      ' – ',
      '',
    ]) {
      expect(hasTextToTranslate(text, undefined), text).toBe(false);
    }
  });

  it('reads placeholders in the syntax of the area', () => {
    expect(hasTextToTranslate('{count}', 'single-brace')).toBe(false);
    expect(hasTextToTranslate('{count}', 'double-brace')).toBe(true);
  });
});
