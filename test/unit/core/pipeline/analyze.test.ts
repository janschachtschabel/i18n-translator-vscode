import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { compileVariants, DEFAULT_VARIANTS } from '../../../../src/core/checks/variants';
import { analyzeRoot, filesToRead } from '../../../../src/core/pipeline/analyze';

const options = {
  referenceLanguage: 'de',
  baseFileLanguage: 'en',
  variants: compileVariants(DEFAULT_VARIANTS).variants,
  severityOverrides: {},
  ignoreSameAsReference: [],
};
const source = (relPath: string, text: string) => ({ relPath, bytes: new TextEncoder().encode(text) });

describe('analyzeRoot', () => {
  it('keeps the first of two files that a pattern maps to the same locale and warns about the other', () => {
    const area = { ...ANGULAR_PRESET, files: '{bundle}/[sub/]{locale}.json' };
    const analysis = analyzeRoot(
      area,
      'i18n',
      [source('i18n/common/sub/de.json', '{"b":"B"}'), source('i18n/common/de.json', '{"a":"A"}')],
      options,
    );
    expect(analysis.bundles[0]?.file('de')?.relPath).toBe('i18n/common/de.json');
    expect(analysis.warnings).toEqual([
      'i18n/common/sub/de.json is ignored: i18n/common/de.json already provides de for "common" (check the file pattern of edu-sharing.angular).',
    ]);
  });

  it('selects only the files that belong to the area below the root', () => {
    expect(
      filesToRead(ANGULAR_PRESET, 'i18n', ['i18n/common/de.json', 'i18n/README.md', 'other/common/de.json']),
    ).toEqual(['i18n/common/de.json']);
  });
});
