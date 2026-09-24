import { describe, expect, it } from 'vitest';
import { parseAreaDefinition } from '../../../../src/core/area/parseArea';

const customArea = {
  id: 'kunde.overrides',
  label: 'Kunden-Overrides',
  format: 'json-nested',
  roots: ['customer/i18n'],
  files: '{bundle}/{locale}.json',
  localePattern: '[a-z]{2}(-[a-z0-9]+)*',
  referenceLanguage: 'de',
};

describe('parseAreaDefinition', () => {
  it('accepts a complete custom area', () => {
    expect(parseAreaDefinition(customArea)).toEqual({ ok: true, area: customArea });
  });

  it('uses the id as label when none is given', () => {
    const { label, ...withoutLabel } = customArea;
    const result = parseAreaDefinition(withoutLabel);
    expect(result.ok && result.area.label).toBe('kunde.overrides');
  });

  it('rejects values that are not objects', () => {
    expect(parseAreaDefinition('x')).toEqual({
      ok: false,
      errors: ['An area definition must be an object.'],
    });
  });

  it('collects all problems of an invalid definition', () => {
    const result = parseAreaDefinition({
      id: '',
      format: 'yaml',
      roots: 'customer/i18n',
      files: '{bundle}.json',
      localePattern: '[a-z]{2}',
      mergeSemantics: 'deep',
    });
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors.join('\n');
    expect(errors).toMatch(/"id"/);
    expect(errors).toMatch(/"format" must be one of: json-nested/);
    expect(errors).toMatch(/"roots"/);
    expect(errors).toMatch(/\{locale\}/);
    expect(errors).toMatch(/"mergeSemantics"/);
  });

  it('requires roots unless the area can be detected', () => {
    const { roots, ...withoutRoots } = customArea;
    expect(parseAreaDefinition(withoutRoots).ok).toBe(false);
    expect(
      parseAreaDefinition({
        ...withoutRoots,
        detect: { glob: '**/i18n/common/de.json', marker: 'common/de.json' },
      }).ok,
    ).toBe(true);
  });

  it('requires the detection glob to end with the marker', () => {
    const result = parseAreaDefinition({
      ...customArea,
      detect: { glob: '**/de.json', marker: 'common/de.json' },
    });
    expect(result.ok ? '' : result.errors.join()).toMatch(/"detect"/);
  });
});
