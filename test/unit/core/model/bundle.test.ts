import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { jsonNestedAdapter } from '../../../../src/core/formats/json/jsonNested';
import { buildBundle, type LoadedFile } from '../../../../src/core/model/bundle';
import { keyFromSegments } from '../../../../src/core/model/keys';

const opts = { referenceLanguage: 'de', baseFileLanguage: 'en' };

function file(locale: string, json: string): LoadedFile {
  const doc = { text: json, encoding: 'utf-8' as const, bom: false };
  return { locale, relPath: `i18n/common/${locale}.json`, doc, parsed: jsonNestedAdapter.parse(doc) };
}

const id = (...segments: string[]) => keyFromSegments(segments).id;

describe('buildBundle', () => {
  it('orders keys by the reference file, then adds keys only other locales have', () => {
    const bundle = buildBundle(
      ANGULAR_PRESET,
      'common',
      [file('fr', '{"b":"B","c":"C"}'), file('de', '{"a":"A","b":"B"}')],
      opts,
    );
    expect(bundle.keys.map((key) => key.segments)).toEqual([['a'], ['b'], ['c']]);
  });

  it('exposes values per locale, undefined when the key is absent', () => {
    const bundle = buildBundle(
      ANGULAR_PRESET,
      'common',
      [file('de', '{"a":"A"}'), file('fr', '{"c":"C"}')],
      opts,
    );
    expect(bundle.value(id('a'), 'de')).toBe('A');
    expect(bundle.value(id('c'), 'de')).toBeUndefined();
    expect(bundle.value(id('c'), 'fr')).toBe('C');
    expect(bundle.value(id('a'), 'it')).toBeUndefined();
    expect(bundle.entry(id('a'), 'de')?.fields.value?.valueRange).toEqual([5, 8]);
  });

  it('puts the reference first and sorts the other locales', () => {
    const bundle = buildBundle(
      ANGULAR_PRESET,
      'common',
      [file('it', '{}'), file('en', '{}'), file('de-informal', '{}'), file('de', '{}')],
      opts,
    );
    expect(bundle.reference).toBe('de');
    expect(bundle.locales).toEqual(['de', 'de-informal', 'en', 'it']);
  });

  it('matches the reference language to a regional locale', () => {
    const bundle = buildBundle(ANGULAR_PRESET, 'mds', [file('default', '{}'), file('de_DE', '{}')], opts);
    expect(bundle.reference).toBe('de_DE');
  });

  it('lets the area override the global reference language', () => {
    const area = { ...ANGULAR_PRESET, referenceLanguage: 'en' };
    expect(buildBundle(area, 'common', [file('de', '{}'), file('en', '{}')], opts).reference).toBe('en');
  });

  it('identifies the bundle within its area', () => {
    const bundle = buildBundle(ANGULAR_PRESET, 'common', [file('de', '{}')], opts);
    expect([bundle.id, bundle.areaId, bundle.name]).toEqual([
      'edu-sharing.angular/common',
      'edu-sharing.angular',
      'common',
    ]);
    expect(bundle.file('de')?.relPath).toBe('i18n/common/de.json');
  });
});
