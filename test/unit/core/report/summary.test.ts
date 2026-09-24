import { describe, expect, it } from 'vitest';
import { countBySeverity, summarizeBundle } from '../../../../src/core/report/summary';
import { analyzeFixtureWorkspace } from '../../support/fixtureWorkspace';

const { analysis } = analyzeFixtureWorkspace();
const bundle = (name: string) => analysis.bundles.find((candidate) => candidate.name === name)!;
const counts = (error: number, warning: number, info: number) => ({ error, warning, info });

describe('countBySeverity', () => {
  it('counts the findings per severity (test/fixtures/README.md)', () => {
    expect(countBySeverity(analysis.issues)).toEqual(counts(3, 15, 3));
  });
});

describe('summarizeBundle', () => {
  it('counts the keys of the reference and the findings of the bundle', () => {
    const summary = summarizeBundle(bundle('common'), analysis.issues);
    expect(summary.keys).toBe(12);
    expect(summary.counts).toEqual(counts(2, 10, 2));
  });

  it('lists every locale with its keys and findings, the reference first', () => {
    expect(summarizeBundle(bundle('common'), analysis.issues).locales).toEqual([
      { locale: 'de', keys: 12, counts: counts(0, 1, 0) },
      { locale: 'de-informal', keys: 1, counts: counts(0, 0, 0) },
      { locale: 'de-no-binnen-i', keys: 0, counts: counts(0, 1, 0) },
      { locale: 'en', keys: 12, counts: counts(0, 1, 1) },
      { locale: 'fr', keys: 10, counts: counts(1, 4, 1) },
      { locale: 'it', keys: 13, counts: counts(1, 3, 0) },
    ]);
  });

  it('adds the locales that only have findings, such as a missing file', () => {
    expect(
      summarizeBundle(bundle('admin'), analysis.issues).locales.map(({ locale, keys }) => [locale, keys]),
    ).toEqual([
      ['de', 2],
      ['en', 2],
      ['de-informal', undefined],
      ['fr', undefined],
      ['it', undefined],
    ]);
  });

  it('counts the keys of all locales when the reference file cannot be read', () => {
    expect(summarizeBundle(bundle('broken'), analysis.issues).keys).toBe(1);
  });
});
