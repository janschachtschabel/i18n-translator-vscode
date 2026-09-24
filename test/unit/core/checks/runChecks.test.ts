import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { runChecks } from '../../../../src/core/checks/runChecks';
import type { CheckContext, Finding, Rule } from '../../../../src/core/checks/types';

const context: CheckContext = {
  area: ANGULAR_PRESET,
  bundles: [],
  variants: new Map(),
  ignoreSameAsReference: [],
};

function rule(id: Rule['id'], findings: Finding[]): Rule {
  return { id, defaultSeverity: 'warning', run: () => findings };
}

const finding = (bundleId: string, locale: string, start: number): Finding => ({
  rule: 'missing-key',
  areaId: 'a',
  bundleId,
  locale,
  args: {},
  location: { relPath: `${bundleId}/${locale}.json`, range: [start, start + 1] },
});

describe('runChecks', () => {
  it('applies the default severity', () => {
    const issues = runChecks(context, [rule('missing-key', [finding('b', 'fr', 0)])]);
    expect(issues.map((issue) => issue.severity)).toEqual(['warning']);
  });

  it('applies severity overrides and drops rules that are switched off', () => {
    const rules = [
      rule('missing-key', [finding('b', 'fr', 0)]),
      rule('empty-value', [finding('b', 'fr', 1)]),
    ];
    const issues = runChecks(context, rules, { 'missing-key': 'error', 'empty-value': 'off' });
    expect(issues.map((issue) => issue.severity)).toEqual(['error']);
  });

  it('sorts issues by bundle, locale and position', () => {
    const issues = runChecks(context, [
      rule('missing-key', [
        finding('b', 'it', 5),
        finding('a', 'fr', 9),
        finding('b', 'fr', 7),
        finding('b', 'fr', 2),
      ]),
    ]);
    expect(issues.map((issue) => `${issue.bundleId}/${issue.locale}@${issue.location?.range?.[0]}`)).toEqual([
      'a/fr@9',
      'b/fr@2',
      'b/fr@7',
      'b/it@5',
    ]);
  });
});
