import { describe, expect, it } from 'vitest';
import { ALL_RULES } from '../../../../../src/core/checks/rules';
import { sameAsReferenceRule } from '../../../../../src/core/checks/rules/sameAsReference';
import { RULE_IDS } from '../../../../../src/core/checks/types';
import { bundleOf, run, summarize } from './helpers';

describe('same-as-reference', () => {
  it('reports translations that equal the reference text', () => {
    const bundle = bundleOf('common', { de: '{"MINUTE":"Minute"}', fr: '{"MINUTE":"Minute"}' });
    expect(summarize(run(sameAsReferenceRule, [bundle]))).toEqual(['same-as-reference common/fr MINUTE']);
  });

  it('skips ignored texts, short texts and variants', () => {
    const bundle = bundleOf('common', {
      de: '{"OK":"OK","MIN":"Min.","ASK":"Weiter"}',
      fr: '{"OK":"OK","MIN":"Min."}',
      'de-informal': '{"ASK":"Weiter"}',
    });
    expect(run(sameAsReferenceRule, [bundle])).toEqual([]);
  });

  it('counts letters in any script', () => {
    const bundle = bundleOf('common', { de: '{"G":"Größe"}', it: '{"G":"Größe"}' });
    expect(run(sameAsReferenceRule, [bundle])).toHaveLength(1);
  });

  it('counts only letters outside placeholders and HTML tags', () => {
    const texts = '{"COUNT":"{{count}}","NAME":"<b>{{name}}</b>","LABEL":"<keine>"}';
    const bundle = bundleOf('common', { de: texts, fr: texts });
    expect(summarize(run(sameAsReferenceRule, [bundle]))).toEqual(['same-as-reference common/fr LABEL']);
  });
});

describe('ALL_RULES', () => {
  it('registers every rule id exactly once', () => {
    expect(ALL_RULES.map((rule) => rule.id).sort()).toEqual([...RULE_IDS].sort());
  });
});
