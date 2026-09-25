import { describe, expect, it } from 'vitest';
import { languageTag, parseLocale, pickReference } from '../../../../src/core/model/locale';

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

  it('prefers the main region of the language, then code order', () => {
    expect(pickReference(['de_AT', 'de_DE'], 'de', opts)).toBe('de_DE');
    expect(pickReference(['de_DE', 'de_AT'], 'de', opts)).toBe('de_DE');
    expect(pickReference(['de_CH', 'de_AT'], 'de', opts)).toBe('de_AT');
  });

  it('never makes a variant the reference, even when configured', () => {
    expect(pickReference(['de-informal', 'de'], 'de-informal', opts)).toBeUndefined();
  });

  it('returns undefined when no locale matches', () => {
    expect(pickReference(['en', 'fr'], 'de', opts)).toBeUndefined();
  });
});

describe('languageTag', () => {
  const tag = (code: string) => languageTag(parseLocale(code, { baseFileLanguage: 'en' }));

  it('makes a valid BCP 47 tag, so that screen readers pick the voice of a text', () => {
    expect(tag('de')).toBe('de');
    expect(tag('de_DE')).toBe('de-DE');
    expect(tag('pt-BR')).toBe('pt-BR');
    // Variants are no registered subtags: their language is what matters for the voice.
    expect(tag('de-informal')).toBe('de');
    expect(tag('de-no-binnen-i')).toBe('de');
    expect(tag('default')).toBe('en');
  });

  it('has no tag for a code that names no language', () => {
    expect(tag('messages')).toBeUndefined();
    expect(tag('x')).toBeUndefined();
  });
});
