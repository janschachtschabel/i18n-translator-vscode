import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../../src/core/area/presets';
import { conditionUnbalancedRule } from '../../../../../src/core/checks/rules/conditionUnbalanced';
import { bundleOf, contextOf, run, summarize } from './helpers';

const summary = (bundle: ReturnType<typeof bundleOf>) =>
  summarize(run(conditionUnbalancedRule, [bundle]), 'missing', 'extra', 'unpaired');

describe('condition-unbalanced', () => {
  // edu-sharing cannot evaluate an {{if …}} without its {{endif}} and sends no mail (Mail.replaceString).
  it('reports a translation whose condition lacks its endif', () => {
    const bundle = bundleOf('mail', {
      de: '{"M":"Hallo{{if link}}, hier: {{link}}{{endif}}."}',
      fr: '{"M":"Bonjour{{if link}}, ici : {{link}}."}',
    });
    expect(summary(bundle)).toEqual([
      'condition-unbalanced mail/fr M missing=[] extra=[] unpaired=["{{if link}}"]',
    ]);
  });

  // A renamed condition is never true, and a dropped one loses its part of the mail.
  it('reports conditions that differ from the reference', () => {
    const bundle = bundleOf('mail', {
      de: '{"M":"{{if name}}{{name}}{{endif}} {{if link}}{{link}}{{endif}}"}',
      fr: '{"M":"{{if nom}}{{name}}{{endif}}"}',
    });
    expect(summary(bundle)).toEqual([
      'condition-unbalanced mail/fr M missing=["{{if link}}","{{if name}}"] extra=["{{if nom}}"] unpaired=[]',
    ]);
  });

  it('accepts conditions as in the reference, in any order, and texts without any', () => {
    const bundle = bundleOf('mail', {
      de: '{"M":"{{if a}}A{{endif}} {{if b}}B{{endif}}","T":"Text"}',
      fr: '{"M":"{{if b}}B{{endif}} {{if a}}A{{endif}}","T":"Texte"}',
    });
    expect(summary(bundle)).toEqual([]);
  });

  it('knows no conditions in an area with single braces', () => {
    const area = { ...ANGULAR_PRESET, placeholderSyntax: 'single-brace' as const };
    const bundle = bundleOf('mds', { de: '{"A":"{if a} x"}', fr: '{"A":"y"}' }, area);
    expect(conditionUnbalancedRule.run(contextOf([bundle], area))).toEqual([]);
  });

  it('weighs as an error by default, since the mail is not sent', () => {
    expect(conditionUnbalancedRule.defaultSeverity).toBe('error');
  });
});
