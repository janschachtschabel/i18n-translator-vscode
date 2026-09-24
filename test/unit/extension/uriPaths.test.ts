import { describe, expect, it } from 'vitest';
import { relativeUriPath } from '../../../src/extension/services/uriPaths';

describe('relativeUriPath', () => {
  it('returns the path below the folder', () => {
    expect(relativeUriPath('/home/u/repo', '/home/u/repo/i18n/common/de.json')).toBe('i18n/common/de.json');
    expect(relativeUriPath('/home/u/repo/', '/home/u/repo/de.json')).toBe('de.json');
  });

  it('accepts a differently cased drive letter, as file search reports it on Windows', () => {
    expect(relativeUriPath('/C:/Users/jan/repo', '/c:/Users/jan/repo/i18n/de.json')).toBe('i18n/de.json');
  });

  it('returns undefined for paths outside the folder', () => {
    expect(relativeUriPath('/home/u/repo', '/home/u/repository/de.json')).toBeUndefined();
    expect(relativeUriPath('/home/u/repo', '/home/u/repo')).toBeUndefined();
  });
});
