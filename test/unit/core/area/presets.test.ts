import { describe, expect, it } from 'vitest';
import { compileFilePattern } from '../../../../src/core/area/filePattern';
import { parseAreaDefinition } from '../../../../src/core/area/parseArea';
import { ANGULAR_PRESET, MAIL_PRESET, MDS_PRESET, PRESETS } from '../../../../src/core/area/presets';
import { isOverrideBundle } from '../../../../src/core/checks/rules/support';

describe('presets', () => {
  it('pass their own validation', () => {
    for (const preset of PRESETS) {
      expect(parseAreaDefinition(preset)).toEqual({ ok: true, area: preset });
    }
  });

  it('have unique ids', () => {
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(PRESETS.length);
  });

  it('match the edu-sharing Angular layout', () => {
    const match = compileFilePattern(ANGULAR_PRESET);
    expect(match('common/de.json')).toEqual({ bundle: 'common', locale: 'de' });
    expect(match('topic-page/de-no-binnen-i.json')).toEqual({
      bundle: 'topic-page',
      locale: 'de-no-binnen-i',
    });
    expect(match('README.md')).toBeNull();
  });

  it('match the edu-sharing metadataset layout, with the file without locale as "default"', () => {
    const match = compileFilePattern(MDS_PRESET);
    expect(match('mds.properties')).toEqual({ bundle: 'mds', locale: 'default' });
    expect(match('mds_de_DE.properties')).toEqual({ bundle: 'mds', locale: 'de_DE' });
    expect(match('mds_override_de_DE.properties')).toEqual({ bundle: 'mds_override', locale: 'de_DE' });
    expect(match('valuespaces_i18n.properties')).toEqual({ bundle: 'valuespaces_i18n', locale: 'default' });
    expect(match('valuespace_lrt_i18n_fr_FR.properties')).toEqual({
      bundle: 'valuespace_lrt_i18n',
      locale: 'fr_FR',
    });
    expect(match('mds.xml')).toBeNull();
  });

  it('hide the guard line that opens the main metadataset files', () => {
    expect(MDS_PRESET.ignoredKeys).toEqual(['this_is_a_bug_the_first_line_will_not_be_translated']);
  });

  it('match the edu-sharing mail templates as one bundle, without the override files', () => {
    const match = compileFilePattern(MAIL_PRESET);
    expect(match('templates.xml')).toEqual({ bundle: 'templates', locale: 'default' });
    expect(match('templates_de_DE.xml')).toEqual({ bundle: 'templates', locale: 'de_DE' });
    expect(match('templates_de_DE_override.xml')).toBeNull();
    expect(match('templates_override.xml')).toBeNull();
  });

  // MetadataReader reads {group}_override_{locale} before {group}_{locale}; Angular loads `override` last.
  it('know the override bundles of edu-sharing, which hold only what they change', () => {
    const overrides = (preset: typeof MDS_PRESET, names: string[]) =>
      names.filter((name) => isOverrideBundle(preset, name));
    expect(overrides(MDS_PRESET, ['mds', 'mds_override', 'valuespaces_i18n_override', 'override'])).toEqual([
      'mds_override',
      'valuespaces_i18n_override',
    ]);
    expect(overrides(ANGULAR_PRESET, ['common', 'override', 'overrides', 'x-override'])).toEqual([
      'override',
    ]);
    expect(overrides(MAIL_PRESET, ['templates'])).toEqual([]);
  });

  it('read {name} placeholders in metadatasets and {{name}} in Angular', () => {
    expect(MDS_PRESET.placeholderSyntax).toBe('single-brace');
    expect(ANGULAR_PRESET.placeholderSyntax).toBeUndefined();
  });

  it('merge Angular categories in the order of edu-sharing TRANSLATION_LIST', () => {
    expect(ANGULAR_PRESET.bundleOrder).toEqual([
      'common',
      'admin',
      'recycle',
      'workspace',
      'search',
      'collections',
      'editorial',
      'login',
      'permissions',
      'oer',
      'messages',
      'register',
      'topic-page',
      'profiles',
      'services',
      'stream',
      'override',
    ]);
    expect(ANGULAR_PRESET.mergeSemantics).toBe('shallow-toplevel');
  });
});
