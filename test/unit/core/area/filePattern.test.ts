import { describe, expect, it } from 'vitest';
import { compileFilePattern, formatFilePattern } from '../../../../src/core/area/filePattern';

describe('compileFilePattern', () => {
  describe('one directory per bundle (Angular)', () => {
    const match = compileFilePattern({
      files: '{bundle}/{locale}.json',
      localePattern: '[a-z]{2}(?:-[a-z0-9]+)*',
    });

    it('extracts bundle and locale, including multi-part variants', () => {
      expect(match('common/de-no-binnen-i.json')).toEqual({ bundle: 'common', locale: 'de-no-binnen-i' });
    });

    it('ignores files that do not fit the pattern', () => {
      expect(match('README.md')).toBeNull();
      expect(match('common/sub/de.json')).toBeNull();
      expect(match('common/DE.json')).toBeNull();
    });
  });

  describe('optional locale suffix (metadatasets)', () => {
    const match = compileFilePattern({
      files: '{bundle}[_{locale}].properties',
      localePattern: '[a-z]{2}_[A-Z]{2}',
    });

    it('keeps underscores that belong to the bundle name', () => {
      expect(match('mds_brockhaus_de_DE.properties')).toEqual({ bundle: 'mds_brockhaus', locale: 'de_DE' });
      expect(match('mds_override_de_DE.properties')).toEqual({ bundle: 'mds_override', locale: 'de_DE' });
    });

    it('maps files without suffix to the base file locale', () => {
      expect(match('valuespaces_i18n.properties')).toEqual({ bundle: 'valuespaces_i18n', locale: 'default' });
      expect(match('mds.properties')).toEqual({ bundle: 'mds', locale: 'default' });
    });
  });

  describe('fixed bundle name (mail templates)', () => {
    const match = compileFilePattern({
      files: 'templates[_{locale}].xml',
      localePattern: '[a-z]{2}_[A-Z]{2}',
      bundleName: 'templates',
    });

    it('uses the configured bundle name', () => {
      expect(match('templates_fr_FR.xml')).toEqual({ bundle: 'templates', locale: 'fr_FR' });
      expect(match('templates.xml')).toEqual({ bundle: 'templates', locale: 'default' });
      expect(match('other.xml')).toBeNull();
    });
  });

  describe('literal characters', () => {
    it('matches dots and other regex characters literally', () => {
      const angular = compileFilePattern({ files: '{bundle}/{locale}.json', localePattern: '[a-z]{2}' });
      expect(angular('common/deXjson')).toBeNull();
      const mds = compileFilePattern({
        files: '{bundle}[_{locale}].properties',
        localePattern: '[a-z]{2}_[A-Z]{2}',
      });
      expect(mds('mds_de_DEXproperties')).toBeNull();
      const odd = compileFilePattern({ files: '{bundle}/a+({locale}).json', localePattern: '[a-z]{2}' });
      expect(odd('x/a+(de).json')).toEqual({ bundle: 'x', locale: 'de' });
      expect(odd('x/aa(de).json')).toBeNull();
    });
  });

  describe('optional bundle part', () => {
    it('falls back to the bundle name when the bundle part is absent', () => {
      const match = compileFilePattern({
        files: '[{bundle}_]{locale}.json',
        localePattern: '[a-z]{2}',
        bundleName: 'main',
      });
      expect(match('de.json')).toEqual({ bundle: 'main', locale: 'de' });
      expect(match('extra_de.json')).toEqual({ bundle: 'extra', locale: 'de' });
    });

    it('requires a bundle name as fallback', () => {
      expect(() =>
        compileFilePattern({ files: '[{bundle}_]{locale}.json', localePattern: '[a-z]{2}' }),
      ).toThrow(/bundleName/);
    });
  });

  describe('invalid patterns', () => {
    it('rejects anchors and backreferences in embedded expressions', () => {
      const spec = { files: '{bundle}/{locale}.json' };
      expect(() => compileFilePattern({ ...spec, localePattern: '^[a-z]{2}$' })).toThrow(/anchor/);
      expect(() => compileFilePattern({ ...spec, localePattern: '([a-z])\\1' })).toThrow(/backreference/);
      expect(() => compileFilePattern({ ...spec, localePattern: '(?<x>[a-z])\\k<x>' })).toThrow(
        /backreference/,
      );
      expect(compileFilePattern({ ...spec, localePattern: '[^A-Z$]{2}' })('c/de.json')).toEqual({
        bundle: 'c',
        locale: 'de',
      });
    });

    it('rejects unbalanced optional parts', () => {
      expect(() =>
        compileFilePattern({ files: '{bundle}[_{locale}.json', localePattern: '[a-z]{2}' }),
      ).toThrow(/bracket/);
    });

    it('requires a {locale} placeholder', () => {
      expect(() => compileFilePattern({ files: '{bundle}.json', localePattern: '[a-z]{2}' })).toThrow(
        /\{locale\}/,
      );
    });

    it('requires a bundle name when there is no {bundle} placeholder', () => {
      expect(() =>
        compileFilePattern({ files: 'templates_{locale}.xml', localePattern: '[a-z]{2}' }),
      ).toThrow(/bundleName/);
    });

    it('reports an invalid locale expression', () => {
      expect(() => compileFilePattern({ files: '{bundle}/{locale}.json', localePattern: '(' })).toThrow(
        /localePattern/,
      );
    });
  });
});

describe('formatFilePattern', () => {
  const angular = { files: '{bundle}/{locale}.json', localePattern: '[a-z]{2}(?:-[a-z0-9]+)*' };
  const mds = { files: '{bundle}[_{locale}].properties', localePattern: '[a-z]{2}_[A-Z]{2}' };

  it('fills in bundle and locale', () => {
    expect(formatFilePattern(angular, 'common', 'es')).toBe('common/es.json');
    expect(formatFilePattern(mds, 'mds', 'fr_FR')).toBe('mds_fr_FR.properties');
  });

  it('leaves out optional parts whose placeholder has no value, as for the base file', () => {
    expect(formatFilePattern(mds, 'mds', 'default')).toBe('mds.properties');
  });

  it('leaves out an optional bundle part for the fallback bundle, whose files have none', () => {
    const nested = { files: '[{bundle}/]{locale}.json', localePattern: '[a-z]{2}', bundleName: 'main' };
    expect(formatFilePattern(nested, 'main', 'fr')).toBe('fr.json');
    expect(formatFilePattern(nested, 'extra', 'fr')).toBe('extra/fr.json');
  });

  it('treats only the placeholders themselves as placeholders', () => {
    const odd = { files: '{bundle}/toString/{locale}.json', localePattern: '[a-z]{2}' };
    expect(formatFilePattern(odd, 'common', 'es')).toBe('common/toString/es.json');
  });

  it('refuses paths the area would not recognise as that bundle and locale', () => {
    expect(formatFilePattern(angular, 'common', 'ES')).toBeUndefined();
    expect(formatFilePattern(angular, 'common', 'default')).toBeUndefined();
    expect(formatFilePattern(angular, 'a/b', 'es')).toBeUndefined();
  });
});
