import { describe, expect, it } from 'vitest';
import { htmlMismatchRule } from '../../../../../src/core/checks/rules/htmlMismatch';
import { placeholderMalformedRule } from '../../../../../src/core/checks/rules/placeholderMalformed';
import { placeholderMismatchRule } from '../../../../../src/core/checks/rules/placeholderMismatch';
import { bundleOf, run, summarize } from './helpers';

describe('placeholder-mismatch', () => {
  it('reports parameters that differ from the reference (edu-sharing COMMON_API_ERROR_TITLE)', () => {
    const bundle = bundleOf('common', {
      de: '{"T":"Fehlerdetails ({{date}})"}',
      it: '{"T":"Dettagli dell\'errore ({{data}})"}',
    });
    const findings = run(placeholderMismatchRule, [bundle]);
    expect(summarize(findings, 'missing', 'extra', 'reference')).toEqual([
      'placeholder-mismatch common/it T missing=["{{date}}"] extra=["{{data}}"] reference="de"',
    ]);
    expect(findings[0]?.location).toEqual({ relPath: 'i18n/common/it.json', range: [5, 38] });
  });

  it('checks variants against the reference as well', () => {
    const bundle = bundleOf('common', { de: '{"T":"{{name}}"}', 'de-informal': '{"T":"{{nam}}"}' });
    expect(summarize(run(placeholderMismatchRule, [bundle]))).toEqual([
      'placeholder-mismatch common/de-informal T',
    ]);
  });

  it('accepts whitespace differences and the German gender marker', () => {
    const bundle = bundleOf('common', {
      de: '{"A":"Fehler ({{date}})","P":"Autor{{GENDER_SEPARATOR}}in"}',
      en: '{"A":"Error ({{ date }})","P":"Author"}',
    });
    expect(run(placeholderMismatchRule, [bundle])).toEqual([]);
  });

  it('leaves empty and missing texts to the completeness rules', () => {
    const bundle = bundleOf('common', { de: '{"A":"{{x}}","B":"{{y}}"}', fr: '{"A":""}' });
    expect(run(placeholderMismatchRule, [bundle])).toEqual([]);
  });
});

describe('placeholder-malformed', () => {
  it('reports stray braces in every readable file', () => {
    const bundle = bundleOf('admin', {
      de: '{"W":"Aktuell {{count}} Aufgaben"}',
      en: '{"W":"Current {{{count}} is/are Task(s) active"}',
    });
    expect(summarize(run(placeholderMalformedRule, [bundle]), 'text')).toEqual([
      'placeholder-malformed admin/en W text="{"',
    ]);
  });
});

describe('html-mismatch', () => {
  it('reports tags that differ from the reference', () => {
    const bundle = bundleOf('common', {
      de: '{"H":"Bitte <b>vorsichtig</b> sein"}',
      fr: '{"H":"Soyez prudent"}',
      it: '{"H":"Fai <b>attenzione</b>"}',
    });
    expect(summarize(run(htmlMismatchRule, [bundle]), 'missing', 'extra')).toEqual([
      'html-mismatch common/fr H missing=["</b>","<b>"] extra=[]',
    ]);
  });
});
