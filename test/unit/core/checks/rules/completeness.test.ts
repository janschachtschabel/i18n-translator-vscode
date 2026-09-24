import { describe, expect, it } from 'vitest';
import { emptyValueRule } from '../../../../../src/core/checks/rules/emptyValue';
import { fileProblemRules } from '../../../../../src/core/checks/rules/fileProblems';
import { missingFileRule } from '../../../../../src/core/checks/rules/missingFile';
import {
  misplacedKeyRule,
  missingKeyRule,
  orphanKeyRule,
} from '../../../../../src/core/checks/rules/missingKeys';
import { bundleOf, run, summarize } from './helpers';

describe('missing-key', () => {
  it('reports keys of the reference that a full locale lacks', () => {
    const bundle = bundleOf('common', { de: '{"a":"A","b":"B"}', fr: '{"a":"A"}' });
    expect(summarize(run(missingKeyRule, [bundle]), 'locale')).toEqual([
      'missing-key common/fr b locale="fr"',
    ]);
  });

  it('points to the file that lacks the key', () => {
    const [finding] = run(missingKeyRule, [bundleOf('common', { de: '{"a":"A"}', fr: '{}' })]);
    expect(finding?.location).toEqual({ relPath: 'i18n/common/fr.json' });
  });

  it('ignores sparse variants', () => {
    expect(run(missingKeyRule, [bundleOf('common', { de: '{"a":"A"}', 'de-informal': '{}' })])).toEqual([]);
  });

  it('is not computed for locales without a file', () => {
    const common = bundleOf('common', { de: '{"a":"A"}', fr: '{"a":"A"}' });
    const editorial = bundleOf('editorial', { de: '{"b":"B"}' });
    expect(run(missingKeyRule, [common, editorial])).toEqual([]);
  });
});

describe('orphan-key and misplaced-key', () => {
  it('reports keys that only a translation has', () => {
    const bundle = bundleOf('common', { de: '{"a":"A"}', it: '{"a":"A","OLD":"Vecchio"}' });
    expect(summarize(run(orphanKeyRule, [bundle]), 'reference')).toEqual([
      'orphan-key common/it OLD reference="de"',
    ]);
  });

  it('suggests where a key probably belongs, instead of reporting it as orphan', () => {
    const bundle = bundleOf('common', {
      de: '{"y":{"TITLE":"Titel"}}',
      fr: '{"x":{"TITLE":"Titre"}}',
    });
    expect(summarize(run(misplacedKeyRule, [bundle]), 'suggestion')).toEqual([
      'misplaced-key common/fr x.TITLE suggestion="y.TITLE"',
    ]);
    expect(run(orphanKeyRule, [bundle])).toEqual([]);
    expect(summarize(run(missingKeyRule, [bundle]))).toEqual(['missing-key common/fr y.TITLE']);
  });

  it('points to the key in the translation', () => {
    const [finding] = run(orphanKeyRule, [bundleOf('common', { de: '{}', it: '{"OLD":"x"}' })]);
    expect(finding?.location).toEqual({ relPath: 'i18n/common/it.json', range: [1, 6] });
  });
});

describe('missing-file', () => {
  it('reports full locales of the area that a bundle has no file for', () => {
    const common = bundleOf('common', { de: '{}', fr: '{}', 'de-informal': '{}' });
    const editorial = bundleOf('editorial', { de: '{}' });
    expect(summarize(run(missingFileRule, [common, editorial]), 'locale', 'bundle')).toEqual([
      'missing-file editorial/fr locale="fr" bundle="editorial"',
    ]);
  });

  it('attaches the finding to the reference file', () => {
    const [finding] = run(missingFileRule, [
      bundleOf('a', { de: '{}', fr: '{}' }),
      bundleOf('b', { de: '{}' }),
    ]);
    expect(finding?.location).toEqual({ relPath: 'i18n/b/de.json', range: [0, 0] });
  });
});

describe('empty-value', () => {
  it('reports empty and blank texts, including in variants', () => {
    const bundle = bundleOf('common', {
      de: '{"a":"A","b":"B"}',
      fr: '{"a":"","b":"  "}',
      'de-informal': '{"a":""}',
    });
    expect(summarize(run(emptyValueRule, [bundle]))).toEqual([
      'empty-value common/de-informal a',
      'empty-value common/fr a',
      'empty-value common/fr b',
    ]);
  });

  it('accepts texts that are intentionally empty in the reference (edu-sharing QUOTA.OVERALL)', () => {
    const bundle = bundleOf('common', {
      de: '{"PREFIX":"","QUOTA":""}',
      en: '{"PREFIX":"by","QUOTA":""}',
      'de-informal': '{"QUOTA":""}',
    });
    expect(run(emptyValueRule, [bundle])).toEqual([]);
  });
});

describe('reference file with a syntax error', () => {
  const broken = bundleOf('broken', { de: '{"a": }', en: '{"b":"x"}', fr: '{"c":""}' });

  it('suppresses all completeness findings of the bundle', () => {
    for (const rule of [missingKeyRule, orphanKeyRule, misplacedKeyRule, emptyValueRule]) {
      expect(run(rule, [broken])).toEqual([]);
    }
  });

  it('still reports the syntax error', () => {
    const parseError = fileProblemRules.find((rule) => rule.id === 'parse-error')!;
    expect(summarize(run(parseError, [broken]), 'detail')).toEqual([
      'parse-error broken/de detail="ValueExpected"',
    ]);
  });
});

describe('file problems', () => {
  it('reports non-string values, duplicate keys and invalid UTF-8 with their own rule ids', () => {
    const bundle = bundleOf('common', { de: '{"a":1,"b":"x","b":"y"}' });
    const findings = fileProblemRules.flatMap((rule) => run(rule, [bundle]));
    expect(summarize(findings)).toEqual(['non-string-value common/de a', 'duplicate-key common/de b']);
    expect(fileProblemRules.map((rule) => [rule.id, rule.defaultSeverity])).toEqual([
      ['parse-error', 'error'],
      ['non-string-value', 'warning'],
      ['duplicate-key', 'warning'],
      ['not-utf8', 'error'],
    ]);
  });
});
