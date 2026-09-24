import { describe, expect, it } from 'vitest';
import { normalizeRoot } from '../../../../src/core/area/rootPath';

describe('normalizeRoot', () => {
  it('normalizes separators, dots and slashes', () => {
    expect(normalizeRoot('./customer/i18n')).toBe('customer/i18n');
    expect(normalizeRoot('customer\\i18n\\')).toBe('customer/i18n');
    expect(normalizeRoot('a//b/./c/')).toBe('a/b/c');
  });

  it('maps the workspace folder itself to the empty root', () => {
    expect(normalizeRoot('.')).toBe('');
    expect(normalizeRoot('')).toBe('');
    expect(normalizeRoot('./')).toBe('');
  });

  it('rejects paths outside the workspace folder', () => {
    for (const path of ['../outside', 'a/../../b', 'a/../b', 'C:/abs', 'c:\\abs', '/etc', '//server/share']) {
      expect(normalizeRoot(path), path).toBeUndefined();
    }
  });
});
