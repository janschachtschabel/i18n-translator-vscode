import { describe, expect, it } from 'vitest';
import { isPlainRelativePath, relativeUriPath } from '../../../src/extension/services/uriPaths';

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

describe('relativeUriPath', () => {
  it('returns the path below the folder', () => {
    expect(relativeUriPath('/home/u/repo', '/home/u/repo/i18n/common/de.json')).toBe('i18n/common/de.json');
    expect(relativeUriPath('/home/u/repo/', '/home/u/repo/de.json')).toBe('de.json');
  });

  it('accepts a differently cased drive letter, as file search reports it on Windows', () => {
    expect(relativeUriPath('/C:/Users/jan/repo', '/c:/Users/jan/repo/i18n/de.json')).toBe('i18n/de.json');
  });

  it('ignores case in the whole folder path when asked, as on Windows and macOS', () => {
    const opened = '/c:/users/jan/repo';
    expect(relativeUriPath(opened, '/C:/Users/Jan/Repo/Frontend/i18n', true)).toBe('Frontend/i18n');
    expect(relativeUriPath(opened, '/C:/Users/Jan/Repo/Frontend/i18n')).toBeUndefined();
    expect(relativeUriPath(opened, '/C:/Users/Jan/Repository', true)).toBeUndefined();
  });

  it('returns an empty path for the folder itself, as roots do', () => {
    expect(relativeUriPath('/home/u/repo', '/home/u/repo')).toBe('');
    expect(relativeUriPath('/C:/repo/', '/c:/repo')).toBe('');
  });

  it('returns undefined for paths outside the folder', () => {
    expect(relativeUriPath('/home/u/repo', '/home/u/repository/de.json')).toBeUndefined();
    expect(relativeUriPath('/home/u/repo', '/home/u')).toBeUndefined();
  });
});
