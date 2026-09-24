import { describe, expect, it } from 'vitest';
import {
  variantInconsistentRule,
  variantNeededRule,
  variantOrphanRule,
} from '../../../../../src/core/checks/rules/variantRules';
import { compileVariants } from '../../../../../src/core/checks/variants';
import { bundleOf, contextOf, run, summarize } from './helpers';

describe('variant-needed', () => {
  it('reports base texts with a formal address that the informal variant does not override', () => {
    const bundle = bundleOf('common', {
      de: '{"ASK":"Möchten Sie fortfahren?","SAVE":"Speichern"}',
      'de-informal': '{}',
    });
    const findings = run(variantNeededRule, [bundle]);
    expect(summarize(findings, 'match', 'base')).toEqual([
      'variant-needed common/de-informal ASK match="Sie" base="de"',
    ]);
    expect(findings[0]?.location).toEqual({ relPath: 'i18n/common/de.json', range: [7, 32] });
  });

  it('reports gender markers for de-no-binnen-i', () => {
    const bundle = bundleOf('common', { de: '{"P":"Autor{{GENDER_SEPARATOR}}in"}', 'de-no-binnen-i': '{}' });
    expect(summarize(run(variantNeededRule, [bundle]), 'match')).toEqual([
      'variant-needed common/de-no-binnen-i P match="{{GENDER_SEPARATOR}}"',
    ]);
  });

  it('also applies to bundles without a variant file when the area uses the variant', () => {
    const common = bundleOf('common', { de: '{}', 'de-informal': '{}' });
    const admin = bundleOf('admin', { de: '{"ASK":"Wollen Sie wirklich fortfahren?"}' });
    expect(summarize(run(variantNeededRule, [common, admin]))).toEqual([
      'variant-needed admin/de-informal ASK',
    ]);
  });

  it('is silent when the variant overrides the key or the area does not use the variant', () => {
    const overridden = bundleOf('common', {
      de: '{"ASK":"Möchten Sie?"}',
      'de-informal': '{"ASK":"Möchtest Du?"}',
    });
    const unused = bundleOf('other', { de: '{"ASK":"Möchten Sie?"}' });
    expect(run(variantNeededRule, [overridden])).toEqual([]);
    expect(run(variantNeededRule, [unused])).toEqual([]);
  });
});

describe('variant rules with an invalid expression', () => {
  it('skip the check whose expression did not compile', () => {
    const bundle = bundleOf('common', {
      de: '{"ASK":"Möchten Sie?"}',
      'de-informal': '{"ASK":"Möchten Sie?"}',
    });
    const { variants } = compileVariants({
      'de-informal': { base: 'de', requiredWhen: '(', forbidden: '(' },
    });
    const ctx = { ...contextOf([bundle]), variants };
    expect(variantNeededRule.run(ctx)).toEqual([]);
    expect(variantInconsistentRule.run(ctx)).toEqual([]);
  });
});

describe('variant-inconsistent', () => {
  it('reports variant texts that still contain what the variant should avoid', () => {
    const bundle = bundleOf('collections', {
      de: '{"D":"Erstellen Sie eine Sammlung für Ihr Medienzentrum."}',
      'de-informal': '{"D":"Erstelle eine Sammlung für Ihr Medienzentrum."}',
    });
    expect(summarize(run(variantInconsistentRule, [bundle]), 'match')).toEqual([
      'variant-inconsistent collections/de-informal D match="Ihr"',
    ]);
  });
});

describe('variant-orphan', () => {
  it('reports variant keys that the base does not have', () => {
    const bundle = bundleOf('common', { de: '{"A":"A"}', 'de-no-binnen-i': '{"A":"A","OLD":"alt"}' });
    expect(summarize(run(variantOrphanRule, [bundle]), 'base')).toEqual([
      'variant-orphan common/de-no-binnen-i OLD base="de"',
    ]);
  });
});
