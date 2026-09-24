import { describe, expect, it } from 'vitest';
import { compileFilePattern } from '../../../../src/core/area/filePattern';

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

  describe('invalid patterns', () => {
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
