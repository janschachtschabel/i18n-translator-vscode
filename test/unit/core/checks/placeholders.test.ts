import { describe, expect, it } from 'vitest';
import {
  asPlaceholder,
  compareParams,
  scanPlaceholders,
  withoutPlaceholders,
} from '../../../../src/core/checks/placeholders';

describe('scanPlaceholders with single braces (edu-sharing metadatasets)', () => {
  it('finds {name} parameters and still the gender marker, which edu-sharing replaces there too', () => {
    const text = '{user} hat Sie zu "{placeholder}" eingeladen, Autor{{GENDER_SEPARATOR}}in';
    expect(scanPlaceholders(text, 'single-brace')).toMatchObject({
      params: ['placeholder', 'user'],
      genderSeparators: 1,
      malformed: [],
    });
  });

  it('reports stray, empty and doubled braces', () => {
    expect(scanPlaceholders('{user', 'single-brace').malformed).toEqual([{ index: 0, text: '{' }]);
    expect(scanPlaceholders('{ }', 'single-brace').malformed).toEqual([{ index: 0, text: '{ }' }]);
    expect(scanPlaceholders('{{name}}', 'single-brace').malformed).toEqual([
      { index: 0, text: '{' },
      { index: 7, text: '}' },
    ]);
    expect(scanPlaceholders('{GENDER_SEPARATOR}', 'single-brace').malformed).toHaveLength(1);
  });

  it('writes and blanks out a parameter in the syntax of its area', () => {
    expect(asPlaceholder('user', 'single-brace')).toBe('{user}');
    expect(asPlaceholder('user')).toBe('{{user}}');
    expect(withoutPlaceholders('{user} x {{y}}', 'single-brace')).toBe('  x { }');
  });
});

describe('scanPlaceholders', () => {
  it('finds parameters and normalizes inner whitespace', () => {
    expect(scanPlaceholders('Hallo {{ name }}, heute ist {{date}}.')).toMatchObject({
      params: ['date', 'name'],
      malformed: [],
    });
  });

  it('reports a stray brace next to a valid parameter (edu-sharing admin STATUS_WARN)', () => {
    const scan = scanPlaceholders('Current {{{count}} is active');
    expect(scan.params).toEqual(['count']);
    expect(scan.malformed).toEqual([{ index: 8, text: '{' }]);
  });

  it('reports unbalanced and empty placeholders', () => {
    expect(scanPlaceholders('{name}}').malformed.map((m) => m.text)).toEqual(['{', '}}']);
    expect(scanPlaceholders('{{}}').malformed).toEqual([{ index: 0, text: '{{}}' }]);
    expect(scanPlaceholders('{{ }}').malformed).toEqual([{ index: 0, text: '{{ }}' }]);
    expect(scanPlaceholders('x {{a}').malformed).toEqual([
      { index: 2, text: '{{' },
      { index: 5, text: '}' },
    ]);
  });

  it('treats the German gender marker separately from parameters', () => {
    expect(scanPlaceholders('Autor{{GENDER_SEPARATOR}}in')).toMatchObject({
      params: [],
      genderSeparators: 1,
    });
  });

  it('reports a gender marker with spaces, which edu-sharing would show unreplaced', () => {
    expect(scanPlaceholders('Autor{{ GENDER_SEPARATOR }}in')).toEqual({
      params: [],
      conditions: [],
      endifs: 0,
      genderSeparators: 0,
      malformed: [{ index: 5, text: '{{ GENDER_SEPARATOR }}' }],
    });
  });

  it('recognizes mail template conditions', () => {
    expect(scanPlaceholders('{{if message}}Nachricht: {{message}}{{endif}}')).toMatchObject({
      params: ['message'],
      conditions: ['message'],
      endifs: 1,
    });
  });

  it('keeps structured parameter names as they are', () => {
    expect(scanPlaceholders('{{assigner.firstName}} {{image:/images/logo.png}}').params).toEqual([
      'assigner.firstName',
      'image:/images/logo.png',
    ]);
  });

  it('returns an empty scan for plain text', () => {
    expect(scanPlaceholders('Speichern')).toEqual({
      params: [],
      conditions: [],
      endifs: 0,
      genderSeparators: 0,
      malformed: [],
    });
  });
});

describe('compareParams', () => {
  it('lists parameters missing from and added to the translation', () => {
    expect(compareParams(scanPlaceholders('({{date}})'), scanPlaceholders('({{data}})'))).toEqual({
      missing: ['date'],
      extra: ['data'],
    });
  });

  it('ignores whitespace and the gender marker', () => {
    const reference = scanPlaceholders('Autor{{GENDER_SEPARATOR}}in ({{ date }})');
    expect(compareParams(reference, scanPlaceholders('Author ({{date}})'))).toEqual({
      missing: [],
      extra: [],
    });
  });
});
