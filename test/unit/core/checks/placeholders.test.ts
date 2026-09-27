import { describe, expect, it } from 'vitest';
import {
  asPlaceholder,
  compareConditions,
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

// edu-sharing replaces exactly "{{" + name + "}}" in a mail (Mail.replaceString): a "{{ link }}" stays in the mail as
// it is (audit L-31).
describe('scanPlaceholders with exact double braces (edu-sharing mail templates)', () => {
  it('keeps the white space inside a parameter, so that it differs from the reference', () => {
    const reference = scanPlaceholders('Hier: {{link}}', 'double-brace-exact');
    const translation = scanPlaceholders('Ici : {{ link }}', 'double-brace-exact');
    expect(translation.params).toEqual([' link ']);
    expect(compareParams(reference, translation)).toEqual({ missing: ['link'], extra: [' link '] });
    expect(asPlaceholder(' link ', 'double-brace-exact')).toBe('{{ link }}');
  });

  it('reports such a parameter as malformed, also where the reference has it the same', () => {
    expect(scanPlaceholders('Ici : {{ link }} {{name }}', 'double-brace-exact').malformed).toEqual([
      { index: 6, text: '{{ link }}' },
      { index: 17, text: '{{name }}' },
    ]);
  });

  it('reads conditions, the gender marker and stray braces as double braces do', () => {
    const text = '{{if link}}{{link}}{{endif}} Autor{{GENDER_SEPARATOR}}in {{ }} {{ GENDER_SEPARATOR }} }';
    expect(scanPlaceholders(text, 'double-brace-exact')).toEqual(scanPlaceholders(text));
    expect(withoutPlaceholders(text, 'double-brace-exact')).toBe(withoutPlaceholders(text));
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
      unpaired: [],
      genderSeparators: 0,
      malformed: [{ index: 5, text: '{{ GENDER_SEPARATOR }}' }],
    });
  });

  it('recognizes mail template conditions', () => {
    expect(scanPlaceholders('{{if message}}Nachricht: {{message}}{{endif}}')).toMatchObject({
      params: ['message'],
      conditions: ['message'],
      unpaired: [],
    });
  });

  // edu-sharing (Mail.replaceString) splits a mail at "{{if ": each part needs its {{endif}}, or the mail is not sent;
  // an {{endif}} before any condition stays in the mail as text, and conditions do not nest.
  it('names the conditions and endifs without their pair, in text order', () => {
    expect(scanPlaceholders('{{if a}}A{{endif}} {{if b}}B{{endif}}').unpaired).toEqual([]);
    expect(scanPlaceholders('{{if a}}A').unpaired).toEqual(['{{if a}}']);
    expect(scanPlaceholders('{{endif}}A {{if a}}B{{endif}}').unpaired).toEqual(['{{endif}}']);
    expect(scanPlaceholders('{{if a}}{{if b}}B{{endif}}{{endif}}').unpaired).toEqual([
      '{{if a}}',
      '{{endif}}',
    ]);
  });

  // edu-sharing takes a condition only as written: "{{if " and the name up to "}}", and "{{endif}}".
  it('takes conditions and endifs only as edu-sharing does', () => {
    expect(scanPlaceholders('{{if !link }}L{{endif}}').conditions).toEqual(['!link ']);
    expect(scanPlaceholders('{{if a}}A{{ endif }}')).toMatchObject({
      params: ['endif'],
      unpaired: ['{{if a}}'],
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
      unpaired: [],
      genderSeparators: 0,
      malformed: [],
    });
  });
});

describe('compareConditions', () => {
  it('lists the conditions missing from and added to the translation', () => {
    const reference = scanPlaceholders('{{if a}}A{{endif}} {{if b}}B{{endif}}');
    expect(compareConditions(reference, scanPlaceholders('{{if b}}B{{endif}} {{if c}}C{{endif}}'))).toEqual({
      missing: ['a'],
      extra: ['c'],
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
