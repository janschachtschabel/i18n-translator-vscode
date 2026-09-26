import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET, MAIL_PRESET, MDS_PRESET } from '../../../../src/core/area/presets';
import { compileVariants, DEFAULT_VARIANTS } from '../../../../src/core/checks/variants';
import { analyzeRoot, filesToRead } from '../../../../src/core/pipeline/analyze';

const options = {
  referenceLanguage: 'de',
  baseFileLanguage: 'en',
  variants: compileVariants(DEFAULT_VARIANTS).variants,
  severityOverrides: {},
  ignoreSameAsReference: [],
};
const source = (relPath: string, text: string) => ({ relPath, bytes: new TextEncoder().encode(text) });

describe('analyzeRoot', () => {
  it('keeps the first of two files that a pattern maps to the same locale and warns about the other', () => {
    const area = { ...ANGULAR_PRESET, files: '{bundle}/[sub/]{locale}.json' };
    const analysis = analyzeRoot(
      area,
      'i18n',
      [source('i18n/common/sub/de.json', '{"b":"B"}'), source('i18n/common/de.json', '{"a":"A"}')],
      options,
    );
    expect(analysis.bundles[0]?.file('de')?.relPath).toBe('i18n/common/de.json');
    expect(analysis.warnings).toEqual([
      'i18n/common/sub/de.json is ignored: i18n/common/de.json already provides de for "common" (check the file pattern of edu-sharing.angular).',
    ]);
  });

  it('selects only the files that belong to the area below the root', () => {
    expect(
      filesToRead(ANGULAR_PRESET, 'i18n', ['i18n/common/de.json', 'i18n/README.md', 'other/common/de.json']),
    ).toEqual(['i18n/common/de.json']);
  });
});

describe('analyzeRoot with the metadataset preset', () => {
  const GUARD = 'this_is_a_bug_the_first_line_will_not_be_translated: what the hell\n';
  const latin1 = (relPath: string, text: string) => ({ relPath, bytes: Buffer.from(text, 'latin1') });
  const analysis = analyzeRoot(
    MDS_PRESET,
    'mds/i18n',
    [
      source('mds/i18n/mds.properties', `${GUARD}a: A\nb: B\nb: B2\n`),
      latin1('mds/i18n/mds_de_DE.properties', `${GUARD}a: Ä\nb: B\n`),
      latin1('mds/i18n/mds_fr_FR.properties', 'a: à\n'),
      source('mds/i18n/valuespaces_i18n.properties', 'x: X\n'),
    ],
    options,
  );
  const mds = analysis.bundles.find((bundle) => bundle.name === 'mds')!;

  it('groups the files by bundle and puts the reference de_DE first', () => {
    expect(analysis.bundles.map((bundle) => bundle.name)).toEqual(['mds', 'valuespaces_i18n']);
    expect(mds.locales).toEqual(['de_DE', 'default', 'fr_FR']);
    expect(mds.value(mds.keys[0]!.id, 'de_DE')).toBe('Ä');
    expect(mds.value(mds.keys[0]!.id, 'fr_FR')).toBe('à');
  });

  it('hides the guard line from the bundle and the findings but keeps it with the file', () => {
    expect(mds.keys.map((key) => key.segments)).toEqual([['a'], ['b']]);
    expect(analysis.issues.filter((issue) => JSON.stringify(issue).includes('this_is_a_bug'))).toEqual([]);
    expect(mds.file('de_DE')?.hidden?.map((entry) => entry.key.segments)).toEqual([
      ['this_is_a_bug_the_first_line_will_not_be_translated'],
    ]);
  });

  it('finds the gaps against de_DE and reports repeated keys, but not ISO-8859-1', () => {
    const summary = analysis.issues.map((issue) => [issue.rule, issue.locale, issue.args['key'] ?? '']);
    expect(summary).toContainEqual(['missing-key', 'fr_FR', 'b']);
    expect(summary).toContainEqual(['duplicate-key', 'default', 'b']);
    expect(summary).toContainEqual(['missing-file', 'de_DE', '']);
    expect(analysis.issues.filter((issue) => issue.rule === 'not-utf8')).toEqual([]);
  });
});

describe('analyzeRoot with the mail template preset', () => {
  const template = (name: string, fields: string) => `<template name="${name}">${fields}</template>`;
  const file = (...templates: string[]) => `<templates>${templates.join('')}</templates>`;
  const analysis = analyzeRoot(
    MAIL_PRESET,
    'mail',
    [
      source('mail/templates.xml', file(template('invited', '<subject>S</subject><message>M</message>'))),
      source(
        'mail/templates_de_DE.xml',
        file(
          template('invited', '<subject>Einladung</subject><message><![CDATA[Hallo {{name}}]]></message>'),
          template('added_inbox', '<message>Neu</message>'),
        ),
      ),
      source(
        'mail/templates_fr_FR.xml',
        file(template('invited', '<subject>Invitation</subject><message>Bonjour {{nom}}</message>')),
      ),
    ],
    options,
  );
  const templates = analysis.bundles[0]!;

  it('reads one bundle with a row per field and de_DE as reference', () => {
    expect(analysis.bundles.map((bundle) => bundle.name)).toEqual(['templates']);
    expect(templates.locales).toEqual(['de_DE', 'default', 'fr_FR']);
    expect(templates.keys.map((key) => key.segments.join('.'))).toEqual([
      'invited.subject',
      'invited.message',
      'added_inbox.message',
    ]);
  });

  it('finds a missing template and differing placeholders', () => {
    const summary = analysis.issues.map((issue) => [issue.rule, issue.locale, issue.args['key'] ?? '']);
    expect(summary).toContainEqual(['missing-key', 'fr_FR', 'added_inbox.message']);
    expect(summary).toContainEqual(['placeholder-mismatch', 'fr_FR', 'invited.message']);
  });
});
