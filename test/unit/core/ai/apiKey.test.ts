import { describe, expect, it } from 'vitest';
import { keyProblem } from '../../../../src/core/ai/apiKey';

describe('keyProblem', () => {
  it('takes a key without blanks inside, trimmed, of up to 512 characters', () => {
    expect(keyProblem('  abc-123_XYZ.=\n')).toBeUndefined();
    expect(keyProblem('x'.repeat(512))).toBeUndefined();
    expect(keyProblem('')).toBe('empty');
    expect(keyProblem(' \n ')).toBe('empty');
    expect(keyProblem('abc def')).toBe('blank');
    expect(keyProblem('abc\ndef')).toBe('blank');
    expect(keyProblem('x'.repeat(513))).toBe('too-long');
  });

  it('takes only visible ASCII: a zero-width space, as copying from a web page adds, is none of it', () => {
    expect(keyProblem('abc\u200bdef')).toBe('characters');
    expect(keyProblem('\u200babc')).toBe('characters');
    expect(keyProblem('schlüssel')).toBe('characters');
  });
});
