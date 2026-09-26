import { describe, expect, it } from 'vitest';
import { MDS_PRESET } from '../../../src/core/area/presets';
import { formatMessage } from '../../../src/core/checks/messages';
import type { Issue } from '../../../src/core/checks/types';
import { keyFromSegments } from '../../../src/core/model/keys';
import { buildBundleViewModel, type BundleViewModel } from '../../../src/shared/viewModel';
import { analyzeFixtureWorkspace, analyzeTexts } from '../support/fixtureWorkspace';

const { analysis } = analyzeFixtureWorkspace();
const VARIANTS = ['de-informal', 'de-no-binnen-i'];

function modelOf(name: string): BundleViewModel {
  const bundle = analysis.bundles.find((candidate) => candidate.name === name)!;
  return buildBundleViewModel(bundle, {
    issues: analysis.issues,
    variants: VARIANTS,
    baseFileLanguage: 'en',
    localize: (message) => formatMessage(message.template, message.args),
  });
}

const common = modelOf('common');
const row = (dotted: string) => common.rows.find((candidate) => candidate.key === dotted)!;
const rules = (dotted: string, locale: string) =>
  row(dotted).cells[locale]!.issues.map((issue) => issue.rule);

describe('buildBundleViewModel', () => {
  it('has one row per key: the reference order, then the keys only other languages have', () => {
    expect(common.rows).toHaveLength(14);
    expect(common.rows.slice(0, 3).map((candidate) => candidate.key)).toEqual([
      'ERROR_TITLE',
      'PERSON',
      'ASK',
    ]);
    expect(common.rows.slice(-2).map((candidate) => candidate.key)).toEqual(['FILE.TITLE', 'OLD_KEY']);
    expect(row('CCMAIL.mail.smtp.server').entryId).toBe(keyFromSegments(['CCMAIL', 'mail.smtp.server']).id);
  });

  it('describes the languages: reference, variants, files and their counts', () => {
    expect(
      common.locales.map(({ code, reference, variant, hasFile, missing, findings }) => [
        code,
        reference,
        variant,
        hasFile,
        missing,
        findings,
      ]),
    ).toEqual([
      ['de', true, false, true, 0, 1],
      ['de-informal', false, true, true, 0, 0],
      ['de-no-binnen-i', false, true, true, 0, 1],
      ['en', false, false, true, 0, 2],
      ['fr', false, false, true, 2, 6],
      ['it', false, false, true, 1, 4],
    ]);
    expect(common.locales.map((locale) => locale.label)).toEqual(Array(6).fill(undefined));
  });

  it('names the file without locale by its language, as edu-sharing reads it', () => {
    const mds = analyzeTexts({ 'mds.properties': 'a: A\n', 'mds_de_DE.properties': 'a: B\n' }, MDS_PRESET);
    const model = buildBundleViewModel(mds.bundles[0]!, {
      issues: mds.issues,
      variants: [],
      baseFileLanguage: 'en',
      localize: (message) => formatMessage(message.template, message.args),
    });
    expect(model.locales.map(({ code, label, lang }) => [code, label, lang])).toEqual([
      ['de_DE', undefined, 'de-DE'],
      ['default', 'default (en)', 'en'],
    ]);
  });

  it('puts the texts and the findings into their cells', () => {
    expect(row('CANCEL').cells['fr']).toEqual({
      value: undefined,
      issues: [expect.objectContaining({ rule: 'missing-key', severity: 'warning' })],
    });
    expect(row('ERROR_TITLE').cells['fr']!.value).toBe('Erreur ({{data}})');
    expect(row('ERROR_TITLE').cells['fr']!.issues[0]!.message).toBe(
      'The placeholders of ERROR_TITLE differ from the reference de: missing {{date}}, extra {{data}}.',
    );
    expect(rules('FILE.TITLE', 'it')).toEqual(['misplaced-key']);
    expect(rules('ASK', 'de')).toEqual(['key-overridden']);
    expect(rules('PERSON', 'de-no-binnen-i')).toEqual(['variant-needed']);
    expect(row('PERSON').cells['de-no-binnen-i']!.value).toBeUndefined();
    expect(rules('SAVE', 'fr')).toEqual(['empty-value']);
    expect(row('SAVE').cells['fr']!.value).toBe('');
  });

  it('adds languages without a file that findings point to', () => {
    const admin = modelOf('admin');
    expect(admin.locales.map(({ code, hasFile }) => [code, hasFile])).toEqual([
      ['de', true],
      ['en', true],
      ['de-informal', false],
      ['fr', false],
      ['it', false],
    ]);
    expect(admin.locales.find((locale) => locale.code === 'fr')!.issues.map((issue) => issue.rule)).toEqual([
      'missing-file',
    ]);
    const ask = admin.rows.find((candidate) => candidate.key === 'ASK')!;
    expect(ask.cells['de-informal']).toEqual({
      value: undefined,
      issues: [expect.objectContaining({ rule: 'variant-needed' })],
    });
  });

  it('keeps findings about a file with its language', () => {
    const broken = modelOf('broken');
    expect(broken.locales.find((locale) => locale.code === 'de')!.issues.map((issue) => issue.rule)).toEqual([
      'parse-error',
    ]);
    expect(broken.issues).toEqual([]);
  });

  it('keeps findings without a language for the whole bundle', () => {
    const bundle = analysis.bundles.find((candidate) => candidate.name === 'common')!;
    const general: Issue = {
      rule: 'parse-error',
      severity: 'error',
      areaId: bundle.areaId,
      bundleId: bundle.id,
      args: { detail: 'unexpected end', key: '' },
    };
    const model = buildBundleViewModel(bundle, {
      issues: [general],
      variants: VARIANTS,
      baseFileLanguage: 'en',
      localize: (message) => formatMessage(message.template, message.args),
    });
    expect(model.issues.map((issue) => issue.rule)).toEqual(['parse-error']);
    expect(model.locales.flatMap((locale) => locale.issues)).toEqual([]);
    expect(model.locales.map((locale) => locale.findings)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('findings about keys without a row', () => {
  it('shows them at their language instead of losing them', () => {
    // A duplicate object key and a number at a key: the adapter reports both with a key, but neither is a text,
    // so no row exists for them.
    const analysis = analyzeTexts({
      'common/de.json': '{"A":"a","N":5,"O":{"X":"x"},"O":{"X":"y"}}',
      'common/fr.json': '{"A":"b"}',
    });
    const bundle = analysis.bundles[0]!;
    const view = buildBundleViewModel(bundle, {
      issues: analysis.issues,
      variants: VARIANTS,
      baseFileLanguage: 'en',
      localize: (message) => formatMessage(message.template, message.args),
    });
    const de = view.locales.find((locale) => locale.code === 'de')!;
    const inCells = view.rows.flatMap((row) => Object.values(row.cells).flatMap((cell) => cell.issues));
    const shown = [...de.issues, ...inCells.filter((issue) => issue.rule !== 'missing-key'), ...view.issues];
    expect(shown.map((issue) => issue.rule).sort()).toEqual(
      analysis.issues
        .filter((issue) => issue.locale === 'de')
        .map((issue) => issue.rule)
        .sort(),
    );
    expect(de.findings).toBe(analysis.issues.filter((issue) => issue.locale === 'de').length);
  });
});
