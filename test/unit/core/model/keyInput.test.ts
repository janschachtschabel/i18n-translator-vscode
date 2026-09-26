import { describe, expect, it } from 'vitest';
import { keyInput, parseKeyInput } from '../../../../src/core/model/keyInput';
import { keyFromSegments } from '../../../../src/core/model/keys';

describe('keyInput and parseKeyInput', () => {
  it('join and split the segments of a key at dots', () => {
    const key = keyFromSegments(['WORKSPACE', 'FILE', 'TITLE']);
    expect(keyInput(key)).toBe('WORKSPACE.FILE.TITLE');
    expect(parseKeyInput('WORKSPACE.FILE.TITLE')).toEqual(key);
  });

  it('keep a dot inside a segment as \\. and a backslash as \\\\, so that such keys survive a round trip', () => {
    for (const segments of [
      ['CCMAIL', 'mail.smtp.server'],
      ['MIME', 'application/vnd.ms-excel'],
      ['PATH', 'C:\\temp'],
      ['a\\.b'],
    ]) {
      const key = keyFromSegments(segments);
      expect(parseKeyInput(keyInput(key)), keyInput(key)).toEqual(key);
    }
    expect(keyInput(keyFromSegments(['CCMAIL', 'mail.smtp.server']))).toBe('CCMAIL.mail\\.smtp\\.server');
  });

  it('take any other backslash as it is', () => {
    expect(parseKeyInput('a\\b.c\\')).toEqual(keyFromSegments(['a\\b', 'c\\']));
  });

  it('keep empty segments, which the checks of a new key refuse', () => {
    expect(parseKeyInput('A..B')).toEqual(keyFromSegments(['A', '', 'B']));
    expect(parseKeyInput('')).toEqual(keyFromSegments(['']));
  });

  it('take the key of a flat format as typed: dots and backslashes belong to the name', () => {
    expect(parseKeyInput('ccm:search.title', true)).toEqual(keyFromSegments(['ccm:search.title']));
    expect(parseKeyInput('a\\.b\\\\c', true)).toEqual(keyFromSegments(['a\\.b\\\\c']));
    expect(keyInput(keyFromSegments(['ccm:search.title']), true)).toBe('ccm:search.title');
  });
});
