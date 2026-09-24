import { describe, expect, it } from 'vitest';
import { parseBundleId } from '../../../../src/core/model/bundle';
import { displayKey, keyFromId } from '../../../../src/core/model/keys';
import { analyzeFixtureWorkspace } from '../../support/fixtureWorkspace';

/** The table "Expected findings" of test/fixtures/README.md, row by row. */
const EXPECTED = [
  'missing-key warning common/fr CANCEL',
  'missing-key warning common/fr WORKSPACE.FILE.TITLE',
  'missing-key warning common/it WORKSPACE.FILE.TITLE',
  'empty-value warning common/fr SAVE',
  'placeholder-mismatch error common/fr ERROR_TITLE',
  'placeholder-malformed error common/it ERROR_TITLE',
  'html-mismatch warning common/fr BOLD_HINT',
  'orphan-key warning common/it OLD_KEY',
  'misplaced-key warning common/it FILE.TITLE',
  'variant-needed warning common/de-no-binnen-i PERSON',
  'key-overridden warning common/de ASK',
  'key-overridden warning common/en ASK',
  'same-as-reference info common/en MINUTE',
  'same-as-reference info common/fr MINUTE',
  'missing-file warning admin/fr -',
  'missing-file warning admin/it -',
  'variant-needed warning admin/de-informal ASK',
  'same-as-reference info admin/en ADMIN.TITLE',
  'missing-file warning editorial/fr -',
  'missing-file warning editorial/it -',
  'parse-error error broken/de -',
];

describe('fixture workspace contract (test/fixtures/README.md)', () => {
  const { roots, analysis } = analyzeFixtureWorkspace();

  it('detects the Angular root', () => {
    expect(roots).toEqual(['Frontend/src/assets/i18n']);
  });

  it('builds one bundle per category', () => {
    expect(analysis.bundles.map((bundle) => bundle.name)).toEqual(['admin', 'broken', 'common', 'editorial']);
  });

  it('reports exactly the expected findings', () => {
    const actual = analysis.issues.map((issue) => {
      const bundle = parseBundleId(issue.bundleId).name;
      const key = issue.entryId ? displayKey(keyFromId(issue.entryId)) : '-';
      return `${issue.rule} ${issue.severity} ${bundle}/${issue.locale} ${key}`;
    });
    expect([...actual].sort()).toEqual([...EXPECTED].sort());
  });

  it('adds up to 3 errors, 15 warnings and 3 infos', () => {
    const count = (severity: string) => analysis.issues.filter((issue) => issue.severity === severity).length;
    expect([count('error'), count('warning'), count('info')]).toEqual([3, 15, 3]);
  });
});
