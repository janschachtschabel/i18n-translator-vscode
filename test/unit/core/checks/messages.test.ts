import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { displayArgs, formatMessage, ISSUE_MESSAGES } from '../../../../src/core/checks/messages';
import { RULE_IDS } from '../../../../src/core/checks/types';
import { compileVariants, DEFAULT_VARIANTS } from '../../../../src/core/checks/variants';
import { analyzeRoot } from '../../../../src/core/pipeline/analyze';

describe('formatMessage', () => {
  it('fills named arguments', () => {
    expect(formatMessage('{key} is missing in {locale}.', { key: 'SAVE', locale: 'fr' })).toBe(
      'SAVE is missing in fr.',
    );
  });

  it('joins lists and marks empty lists', () => {
    expect(formatMessage('missing {missing}, extra {extra}', { missing: ['date', 'time'], extra: [] })).toBe(
      'missing date, time, extra –',
    );
  });

  it('keeps unknown placeholders visible', () => {
    expect(formatMessage('{known} {unknown}', { known: 1 })).toBe('1 {unknown}');
  });
});

describe('displayArgs', () => {
  it('turns every argument into display text, as formatMessage shows it', () => {
    expect(displayArgs({ key: 'SAVE', count: 3, missing: ['date', 'time'], extra: [] })).toEqual({
      key: 'SAVE',
      count: '3',
      missing: 'date, time',
      extra: '–',
    });
  });
});

describe('ISSUE_MESSAGES', () => {
  it('uses only arguments in braces that formatMessage can fill', () => {
    for (const template of Object.values(ISSUE_MESSAGES)) {
      expect(template).not.toMatch(/\{(?!\w+\})/);
    }
  });
});

describe('issue arguments', () => {
  // One synthetic area that triggers every rule once, run through the real pipeline.
  const texts: Record<string, string> = {
    'common/de.json':
      '{"A":"Datei {{name}} <b>gespeichert</b>","MOVED":{"TITLE":"Titel"},"ASK":"Möchten Sie fortfahren?",' +
      '"PERSON":"Autor{{GENDER_SEPARATOR}}in","EMPTY":"Text","SAME":"Dokument","NUM":1,"DUP":"a","DUP":"b",' +
      '"TOP":{"ONLY_COMMON":"x"},"OVER":"Text A","MISSING":"fehlt"}',
    'common/en.json':
      '{"A":"File {{nam}} {{{x}} saved","OLD":{"TITLE":"Title"},"ORPHAN":"o","ASK":"Continue?","PERSON":"Author",' +
      '"EMPTY":"","SAME":"Dokument","TOP":{"ONLY_COMMON":"x"},"OVER":"Text"}',
    'common/de-informal.json': '{"ASK":"Möchten Sie?","EXTRA":"v"}',
    'common/de-no-binnen-i.json': '{}',
    'admin/de.json': '{"OVER":"Text B","TOP":{"OTHER":"y"}}',
    'broken/de.json': '{"a": }',
  };
  const files = [
    ...Object.entries(texts).map(([path, text]) => ({
      relPath: `i18n/${path}`,
      bytes: new TextEncoder().encode(text),
    })),
    // ISO-8859-1 bytes: "ö" and "ß" as single bytes are not valid UTF-8.
    { relPath: 'i18n/latin/de.json', bytes: Uint8Array.from('{"X":"Größe"}', (char) => char.charCodeAt(0)) },
  ];
  const { issues } = analyzeRoot(ANGULAR_PRESET, 'i18n', files, {
    referenceLanguage: 'de',
    baseFileLanguage: 'en',
    variants: compileVariants(DEFAULT_VARIANTS).variants,
    severityOverrides: {},
    ignoreSameAsReference: [],
  });

  it('come from inputs that trigger every rule', () => {
    expect([...new Set(issues.map((issue) => issue.rule))].sort()).toEqual([...RULE_IDS].sort());
  });

  it('fill every placeholder of the message template', () => {
    for (const issue of issues) {
      const names = [...ISSUE_MESSAGES[issue.rule].matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
      expect(
        names.filter((name) => issue.args[name] === undefined),
        issue.rule,
      ).toEqual([]);
    }
  });
});
