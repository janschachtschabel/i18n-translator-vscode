import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { classifyFiles, rootsFromMarkers } from '../../../../src/core/discovery/discover';

describe('rootsFromMarkers', () => {
  it('derives each root by removing the marker path', () => {
    const markers = ['data/1.0.0/json/common/de.json', 'Frontend/src/assets/i18n/common/de.json'];
    expect(rootsFromMarkers(markers, 'common/de.json')).toEqual([
      'Frontend/src/assets/i18n',
      'data/1.0.0/json',
    ]);
  });

  it('supports a root at the workspace folder itself', () => {
    expect(rootsFromMarkers(['common/de.json'], 'common/de.json')).toEqual(['']);
  });

  it('ignores paths that only look similar and removes duplicates', () => {
    expect(rootsFromMarkers(['x/mycommon/de.json', 'x/common/de.json.bak'], 'common/de.json')).toEqual([]);
    expect(rootsFromMarkers(['a/common/de.json', 'a/common/de.json'], 'common/de.json')).toEqual(['a']);
  });
});

describe('classifyFiles', () => {
  const areas = [{ area: ANGULAR_PRESET, roots: ['Frontend/src/assets/i18n'] }];

  it('assigns area, bundle and locale to files below a root', () => {
    expect(classifyFiles(['Frontend/src/assets/i18n/admin/fr.json'], areas)).toEqual([
      {
        areaId: 'edu-sharing.angular',
        root: 'Frontend/src/assets/i18n',
        bundle: 'admin',
        locale: 'fr',
        relPath: 'Frontend/src/assets/i18n/admin/fr.json',
      },
    ]);
  });

  it('skips files outside the roots or outside the pattern', () => {
    expect(
      classifyFiles(
        [
          'Frontend/src/assets/i18n/README.md',
          'other/common/de.json',
          'Frontend/src/assets/i18n2/common/de.json',
        ],
        areas,
      ),
    ).toEqual([]);
  });

  it('accepts Windows separators and roots with a trailing slash', () => {
    const files = classifyFiles(
      ['Frontend\\src\\assets\\i18n\\common\\de.json'],
      [{ area: ANGULAR_PRESET, roots: ['Frontend/src/assets/i18n/'] }],
    );
    expect(files.map((file) => [file.root, file.bundle, file.locale, file.relPath])).toEqual([
      ['Frontend/src/assets/i18n', 'common', 'de', 'Frontend/src/assets/i18n/common/de.json'],
    ]);
  });

  it('supports a root at the workspace folder itself', () => {
    expect(classifyFiles(['common/de.json'], [{ area: ANGULAR_PRESET, roots: [''] }])[0]?.bundle).toBe(
      'common',
    );
  });
});
