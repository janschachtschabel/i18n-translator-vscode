import { describe, expect, it } from 'vitest';
import { emptyValueRule } from '../../../../../src/core/checks/rules/emptyValue';
import { fileProblemRules } from '../../../../../src/core/checks/rules/fileProblems';
import { missingFileRule } from '../../../../../src/core/checks/rules/missingFile';
import {
  misplacedKeyRule,
  missingKeyRule,
  orphanKeyRule,
} from '../../../../../src/core/checks/rules/missingKeys';
import { compileVariants } from '../../../../../src/core/checks/variants';
import { bundleOf, contextOf, run, summarize } from './helpers';

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

  it('still ignores a variant whose configured expression is invalid', () => {
    const bundle = bundleOf('common', { de: '{"a":"A"}', 'de-informal': '{"b":"B"}' });
    const { variants } = compileVariants({ 'de-informal': { base: 'de', requiredWhen: '(' } });
    const ctx = { ...contextOf([bundle]), variants };
    for (const rule of [missingKeyRule, orphanKeyRule, misplacedKeyRule, missingFileRule]) {
      expect(rule.run(ctx)).toEqual([]);
    }
  });

  it('is not computed for locales without a file', () => {
    const common = bundleOf('common', { de: '{"a":"A"}', fr: '{"a":"A"}' });
    const editorial = bundleOf('editorial', { de: '{"b":"B"}' });
    expect(run(missingKeyRule, [common, editorial])).toEqual([]);
  });
});

describe('missing-key with a file without locale (metadatasets, mail templates)', () => {
  // edu-sharing falls back to the file without locale last: its keys exist for every language.
  const bundle = bundleOf('b', {
    default: '{"A":"a","X":"x"}',
    de: '{"A":"A"}',
    fr: '{"A":"a fr","Y":"y"}',
  });

  it('reports a key of that file as missing in every language that lacks it, the reference included', () => {
    expect(summarize(run(missingKeyRule, [bundle]))).toEqual(['missing-key b/de X', 'missing-key b/fr X']);
  });

  it('takes no key of that file for an orphan, but still a key only a translation has', () => {
    expect(summarize(run(orphanKeyRule, [bundle]))).toEqual(['orphan-key b/fr Y']);
  });

  // The license links of edu-sharing's mds.properties: the English fallback is the right text in every language.
  it('needs no key of that file whose text has nothing to translate, and takes it for no orphan', () => {
    const links = bundleOf('b', {
      default:
        '{"A":"a","LINK":"http://creativecommons.org/licenses/by/4.0/","N":"{{n}}","T":"Password reset"}',
      de: '{"A":"A"}',
      fr: '{"A":"a fr","LINK":"http://creativecommons.org/licenses/by/4.0/deed.fr"}',
    });
    expect(summarize(run(missingKeyRule, [links]))).toEqual(['missing-key b/de T', 'missing-key b/fr T']);
    expect(run(orphanKeyRule, [links])).toEqual([]);
    expect(run(misplacedKeyRule, [links])).toEqual([]);
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

  it('prefers the missing key with the longest common ending', () => {
    const bundle = bundleOf('common', {
      de: '{"A":{"TITLE":"a"},"WORKSPACE":{"FILE":{"TITLE":"t"}}}',
      fr: '{"X":{"FILE":{"TITLE":"t"}}}',
    });
    expect(summarize(run(misplacedKeyRule, [bundle]), 'suggestion')).toEqual([
      'misplaced-key common/fr X.FILE.TITLE suggestion="WORKSPACE.FILE.TITLE"',
    ]);
  });

  it('suggests each missing key for one key only', () => {
    const bundle = bundleOf('common', {
      de: '{"SEARCH":{"TITLE":"s"},"UPLOAD":{"TITLE":"u"}}',
      fr: '{"OLD_A":{"TITLE":"a"},"OLD_B":{"TITLE":"b"}}',
    });
    expect(summarize(run(misplacedKeyRule, [bundle]), 'suggestion')).toEqual([
      'misplaced-key common/fr OLD_A.TITLE suggestion="SEARCH.TITLE"',
      'misplaced-key common/fr OLD_B.TITLE suggestion="UPLOAD.TITLE"',
    ]);
  });

  it('gives a contested missing key to the closest match and keeps the others as orphans', () => {
    const bundle = bundleOf('common', {
      de: '{"WORKSPACE":{"FILE":{"TITLE":"t"}}}',
      fr: '{"X":{"TITLE":"x"},"OLD":{"FILE":{"TITLE":"t"}}}',
    });
    expect(summarize(run(misplacedKeyRule, [bundle]), 'suggestion')).toEqual([
      'misplaced-key common/fr OLD.FILE.TITLE suggestion="WORKSPACE.FILE.TITLE"',
    ]);
    expect(summarize(run(orphanKeyRule, [bundle]))).toEqual(['orphan-key common/fr X.TITLE']);
  });

  // Files come from the repository: pairing every extra key with every missing key of the same ending would take
  // quadratic time and memory (audit S-03).
  it('suggests nothing where too many keys share an ending, and reports them as orphans', () => {
    const texts = (prefix: string) =>
      JSON.stringify(
        Object.fromEntries(Array.from({ length: 2_000 }, (_, i) => [`${prefix}${i}`, { X: 'x' }])),
      );
    const bundle = bundleOf('common', { de: texts('A'), fr: texts('B') });
    const started = performance.now();
    expect(run(misplacedKeyRule, [bundle])).toEqual([]);
    expect(run(orphanKeyRule, [bundle])).toHaveLength(2_000);
    expect(performance.now() - started).toBeLessThan(2_000);
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
    const bundle = bundleOf('common', {
      de: '{"a":1,"b":"x","b":"y"}',
      // ISO-8859-1 bytes: "ö" and "ß" as single bytes are not valid UTF-8.
      fr: Uint8Array.from('{"a":"Größe"}', (char) => char.charCodeAt(0)),
    });
    const findings = fileProblemRules.flatMap((rule) => run(rule, [bundle]));
    expect(summarize(findings)).toEqual([
      'non-string-value common/de a',
      'duplicate-key common/de b',
      'not-utf8 common/fr',
    ]);
    expect(fileProblemRules.map((rule) => [rule.id, rule.defaultSeverity])).toEqual([
      ['parse-error', 'error'],
      ['non-string-value', 'warning'],
      ['duplicate-key', 'warning'],
      ['not-utf8', 'error'],
      ['bom-first-key', 'warning'],
    ]);
  });
});
