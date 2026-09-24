import { describe, expect, it } from 'vitest';
import { compileFilePattern } from '../../../../src/core/area/filePattern';
import { parseAreaDefinition } from '../../../../src/core/area/parseArea';
import { ANGULAR_PRESET, PRESETS } from '../../../../src/core/area/presets';

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
