import { describe, expect, it } from 'vitest';
import type { AreaDefinition } from '../../../../src/core/area/areaDefinition';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { jsonNestedAdapter } from '../../../../src/core/formats/json/jsonNested';
import { buildBundle, parseBundleId, type LoadedFile } from '../../../../src/core/model/bundle';
import { keyFromSegments } from '../../../../src/core/model/keys';

const opts = { referenceLanguage: 'de', baseFileLanguage: 'en' };

function file(locale: string, json: string): LoadedFile {
  const doc = { text: json, encoding: 'utf-8' as const, bom: false };
  return { locale, relPath: `i18n/common/${locale}.json`, doc, parsed: jsonNestedAdapter.parse(doc) };
}

function build(files: LoadedFile[], area: AreaDefinition = ANGULAR_PRESET) {
  return buildBundle(area, 'i18n', 'common', files, opts);
}

const id = (...segments: string[]) => keyFromSegments(segments).id;

describe('buildBundle', () => {
  it('orders keys by the reference file, then adds keys only other locales have', () => {
    const bundle = build([file('fr', '{"b":"B","c":"C"}'), file('de', '{"a":"A","b":"B"}')]);
    expect(bundle.keys.map((key) => key.segments)).toEqual([['a'], ['b'], ['c']]);
  });

  it('exposes values per locale, undefined when the key is absent', () => {
    const bundle = build([file('de', '{"a":"A"}'), file('fr', '{"c":"C"}')]);
    expect(bundle.value(id('a'), 'de')).toBe('A');
    expect(bundle.value(id('c'), 'de')).toBeUndefined();
    expect(bundle.value(id('c'), 'fr')).toBe('C');
    expect(bundle.value(id('a'), 'it')).toBeUndefined();
    expect(bundle.entry(id('a'), 'de')?.fields.value?.valueRange).toEqual([5, 8]);
  });

  it('distinguishes an empty text from an absent key', () => {
    expect(build([file('de', '{"a":""}')]).value(id('a'), 'de')).toBe('');
  });

  it('puts the reference first and sorts the other locales', () => {
    const bundle = build([file('it', '{}'), file('en', '{}'), file('de-informal', '{}'), file('de', '{}')]);
    expect(bundle.reference).toBe('de');
    expect(bundle.locales).toEqual(['de', 'de-informal', 'en', 'it']);
  });

  it('matches the reference language to a regional locale, independent of file order', () => {
    expect(build([file('default', '{}'), file('de_DE', '{}')]).reference).toBe('de_DE');
    expect(build([file('de_AT', '{}'), file('de_DE', '{}')]).reference).toBe('de_DE');
    expect(build([file('de_DE', '{}'), file('de_AT', '{}')]).reference).toBe('de_DE');
  });

  it('lets the area override the global reference language', () => {
    const area = { ...ANGULAR_PRESET, referenceLanguage: 'en' };
    expect(build([file('de', '{}'), file('en', '{}')], area).reference).toBe('en');
  });

  it('identifies the bundle by area, root and name', () => {
    const bundle = build([file('de', '{}')]);
    expect([bundle.areaId, bundle.root, bundle.name]).toEqual(['edu-sharing.angular', 'i18n', 'common']);
    expect(parseBundleId(bundle.id)).toEqual({ areaId: 'edu-sharing.angular', root: 'i18n', name: 'common' });
    expect(buildBundle(ANGULAR_PRESET, 'other', 'common', [file('de', '{}')], opts).id).not.toBe(bundle.id);
    expect(bundle.file('de')?.relPath).toBe('i18n/common/de.json');
  });

  it('rejects two files for the same locale', () => {
    expect(() => build([file('de', '{}'), file('de', '{}')])).toThrow(/de/);
  });
});
