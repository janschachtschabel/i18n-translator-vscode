import { describe, expect, it } from 'vitest';
import { hasTextToTranslate, wordsOnly } from '../../../../src/core/checks/translatable';

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

  // Texts come from the repository: a long word must not make every check run quadratic (like audit S-02).
  it('looks for links in linear time', () => {
    const started = performance.now();
    expect(hasTextToTranslate('a'.repeat(100_000), undefined)).toBe(true);
    expect(wordsOnly(`x${'a1+.-'.repeat(20_000)}`, undefined)).toHaveLength(100_001);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('reads placeholders in the syntax of the area', () => {
    expect(hasTextToTranslate('{count}', 'single-brace')).toBe(false);
    expect(hasTextToTranslate('{count}', 'double-brace')).toBe(true);
  });
});
