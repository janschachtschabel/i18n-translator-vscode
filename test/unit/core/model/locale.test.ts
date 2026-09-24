import { describe, expect, it } from 'vitest';
import { parseLocale, pickReference } from '../../../../src/core/model/locale';

const opts = { baseFileLanguage: 'en' };

describe('parseLocale', () => {
  it('parses a plain language code', () => {
    expect(parseLocale('de', opts)).toEqual({ code: 'de', language: 'de', isBaseFile: false });
  });

  it('parses a language variant', () => {
    expect(parseLocale('de-no-binnen-i', opts)).toEqual({
      code: 'de-no-binnen-i',
      language: 'de',
      variant: 'no-binnen-i',
      isBaseFile: false,
    });
  });

  it('parses Java-style and BCP 47 regions', () => {
    expect(parseLocale('de_DE', opts)).toEqual({
      code: 'de_DE',
      language: 'de',
      region: 'DE',
      isBaseFile: false,
    });
    expect(parseLocale('pt-BR', opts)).toEqual({
      code: 'pt-BR',
      language: 'pt',
      region: 'BR',
      isBaseFile: false,
    });
  });

  it('maps the base file to the configured language', () => {
    expect(parseLocale('default', opts)).toEqual({ code: 'default', language: 'en', isBaseFile: true });
  });
});

describe('pickReference', () => {
  it('matches the reference language to a region locale', () => {
    expect(pickReference(['de_DE', 'default', 'fr_FR'], 'de', opts)).toBe('de_DE');
  });

  it('prefers the exact code and never picks a variant', () => {
    expect(pickReference(['de-informal', 'de', 'en'], 'de', opts)).toBe('de');
    expect(pickReference(['de-informal', 'en'], 'de', opts)).toBeUndefined();
  });

  it('can pick the base file when its language is the reference', () => {
    expect(pickReference(['de_DE', 'default'], 'en', opts)).toBe('default');
  });

  it('returns undefined when no locale matches', () => {
    expect(pickReference(['en', 'fr'], 'de', opts)).toBeUndefined();
  });
});
