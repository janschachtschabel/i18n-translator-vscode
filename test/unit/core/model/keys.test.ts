import { describe, expect, it } from 'vitest';
import { displayKey, keyFromId, keyFromSegments } from '../../../../src/core/model/keys';

describe('entry keys', () => {
  it('keeps dotted segments intact in the id', () => {
    const key = keyFromSegments(['ADMIN', 'mail.smtp.server']);
    expect(key.id).toBe('["ADMIN","mail.smtp.server"]');
    expect(key.segments).toEqual(['ADMIN', 'mail.smtp.server']);
  });

  it('joins segments with dots for display', () => {
    expect(displayKey(keyFromSegments(['ADMIN', 'mail.smtp.server']))).toBe('ADMIN.mail.smtp.server');
  });

  it('restores a key from its id', () => {
    const key = keyFromSegments(['MIME', 'application/vnd.ms-excel']);
    expect(keyFromId(key.id)).toEqual(key);
  });

  it('rejects ids that are not a non-empty list of strings', () => {
    expect(() => keyFromId('x')).toThrow();
    expect(() => keyFromId('[]')).toThrow();
    expect(() => keyFromId('[1]')).toThrow();
  });

  it('rejects ids that are not in canonical form', () => {
    expect(() => keyFromId('[ "a" ]')).toThrow();
  });

  it('rejects keys without segments', () => {
    expect(() => keyFromSegments([])).toThrow();
  });
});
