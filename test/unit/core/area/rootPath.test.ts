import { describe, expect, it } from 'vitest';
import { isPlainRelativePath, normalizeRoot } from '../../../../src/core/area/rootPath';

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

describe('isPlainRelativePath', () => {
  it('accepts paths of named segments', () => {
    expect(isPlainRelativePath('Frontend/src/assets/i18n/common/de.json')).toBe(true);
    expect(isPlainRelativePath('de.json')).toBe(true);
  });

  it('refuses paths that could leave the folder they are relative to', () => {
    for (const path of ['', '/abs', 'a//b', 'a/', './a', 'a/../b', '..', 'a\\b', 'c:/x']) {
      expect(isPlainRelativePath(path), path).toBe(false);
    }
  });
});
