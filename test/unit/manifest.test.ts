import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMAT_IDS, MERGE_SEMANTICS } from '../../src/core/area/areaDefinition';
import { RULE_IDS } from '../../src/core/checks/types';
import { DEFAULT_SETTINGS, SETTING_KEYS } from '../../src/core/config/settings';

interface SettingSchema {
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, SettingSchema>;
  items?: SettingSchema;
}

const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  contributes: { configuration: { properties: Record<string, SettingSchema> } };
};
const properties = manifest.contributes.configuration.properties;
const setting = (key: string): SettingSchema => properties[`eduI18n.${key}`]!;

describe('package.json configuration', () => {
  it('declares exactly the settings the extension reads', () => {
    expect(Object.keys(properties).sort()).toEqual(SETTING_KEYS.map((key) => `eduI18n.${key}`).sort());
  });

  it('uses the same defaults as the code', () => {
    expect(setting('referenceLanguage').default).toBe(DEFAULT_SETTINGS.referenceLanguage);
    expect(setting('baseFileLanguage').default).toBe(DEFAULT_SETTINGS.baseFileLanguage);
    expect(setting('areas').default).toEqual([]);
    expect(setting('roots').default).toEqual(DEFAULT_SETTINGS.roots);
    expect(setting('exclude').default).toEqual(DEFAULT_SETTINGS.exclude);
    expect(setting('variants').default).toEqual(DEFAULT_SETTINGS.variants);
    expect(setting('checks.severity').default).toEqual({});
    expect(setting('checks.ignoreSameAsReference').default).toEqual(DEFAULT_SETTINGS.ignoreSameAsReference);
    expect(setting('diagnostics.missing').default).toBe(DEFAULT_SETTINGS.missingDiagnostics);
    expect(setting('backup.intervalMinutes').default).toBe(DEFAULT_SETTINGS.backupIntervalMinutes);
    expect(setting('backup.keep').default).toBe(DEFAULT_SETTINGS.backupKeep);
  });

  it('offers every rule id for severity overrides', () => {
    expect(Object.keys(setting('checks.severity').properties ?? {}).sort()).toEqual([...RULE_IDS].sort());
  });

  it('offers the supported formats and merge semantics for custom areas', () => {
    const area = setting('areas').items?.properties ?? {};
    expect(area['format']?.enum).toEqual([...FORMAT_IDS]);
    expect(area['mergeSemantics']?.enum).toEqual([...MERGE_SEMANTICS]);
  });
});
