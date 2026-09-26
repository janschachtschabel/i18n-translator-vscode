import { describe, expect, it } from 'vitest';
import { parseProperties } from '../../../../src/core/formats/properties/propertiesRead';
import { VALUE_FIELD } from '../../../../src/core/model/types';

const summary = (text: string) =>
  parseProperties(text).entries.map((entry) => [entry.key.segments, entry.fields[VALUE_FIELD]?.value]);

const field = (text: string, index = 0) => parseProperties(text).entries[index]?.fields[VALUE_FIELD];

describe('parseProperties', () => {
  it('splits key and value at "=", ":" or white space, and at one separator only', () => {
    const text = ['a=1', 'b: 2', 'c 3', 'd = 4', 'e\\:f=5', 'g\\ h = 6', 'i:=7'].join('\n');
    expect(summary(text)).toEqual([
      [['a'], '1'],
      [['b'], '2'],
      [['c'], '3'],
      [['d'], '4'],
      [['e:f'], '5'],
      [['g h'], '6'],
      [['i'], '=7'],
    ]);
  });

  it('keeps a key with dots as one segment', () => {
    expect(summary('mail.smtp.server=SMTP')).toEqual([[['mail.smtp.server'], 'SMTP']]);
  });

  it('joins continued lines without the leading white space of the next line', () => {
    const text = 'a=first \\\n    second\nb=x\\\\\nc=y\n';
    expect(summary(text)).toEqual([
      [['a'], 'first second'],
      [['b'], 'x\\'],
      [['c'], 'y'],
    ]);
  });

  it('skips comment lines and blank lines', () => {
    const text = '# comment\n! other\n   # indented\n\n \t\f\na=1\n';
    expect(summary(text)).toEqual([[['a'], '1']]);
  });

  it('reads a "#" at the start of a continued line as part of the value', () => {
    expect(summary('a=x\\\n#y')).toEqual([[['a'], 'x#y']]);
  });

  it('ends a logical line at an empty continued line', () => {
    expect(summary('a=x\\\n\nb=y')).toEqual([
      [['a'], 'x'],
      [['b'], 'y'],
    ]);
  });

  it('drops a backslash at the very end of the text', () => {
    expect(summary('a=b\\')).toEqual([[['a'], 'b']]);
    expect(summary('a=b\\\n')).toEqual([[['a'], 'b']]);
  });

  it('turns escapes into characters', () => {
    expect(summary('a=tab\\there\\u00e4\\=\\\\end\\n\\r\\f\\q')).toEqual([
      [['a'], 'tab\there\u00e4=\\end\n\r\fq'],
    ]);
  });

  it('reads a \\u escape across a continued line, as Java joins the lines first', () => {
    expect(summary('a=\\u00\\\n  e4')).toEqual([[['a'], '\u00e4']]);
  });

  it('reports a malformed \\u escape as a syntax error, since Java refuses to load the file', () => {
    expect(parseProperties('a=\\u12')).toEqual({
      entries: [],
      problems: [{ code: 'parse-error', range: [2, 6], detail: 'MalformedUnicodeEscape' }],
      topLevelKeys: [],
    });
    expect(parseProperties('b=1\na=\\u12zz').problems).toEqual([
      { code: 'parse-error', range: [6, 12], detail: 'MalformedUnicodeEscape' },
    ]);
  });

  it('reads empty values', () => {
    expect(summary('a=\nb\nc = \n')).toEqual([
      [['a'], ''],
      [['b'], ''],
      [['c'], ''],
    ]);
    expect(field('a=\n')?.valueRange).toEqual([2, 2]);
    expect(field('c = \n')?.valueRange).toEqual([4, 4]);
  });

  it('lets the last definition win at the position of the first, and reports every repetition', () => {
    const parsed = parseProperties('a=x\nb=z\na=y\na=w\n');
    expect(parsed.entries.map((entry) => [entry.key.segments, entry.fields[VALUE_FIELD]?.value])).toEqual([
      [['a'], 'w'],
      [['b'], 'z'],
    ]);
    expect(parsed.problems.map((problem) => [problem.code, problem.range, problem.key?.segments])).toEqual([
      ['duplicate-key', [8, 9], ['a']],
      ['duplicate-key', [12, 13], ['a']],
    ]);
    expect(parsed.topLevelKeys).toEqual(['a', 'b']);
  });

  it('records the ranges of key and value; a value runs to the end of its logical line', () => {
    expect(field('key = value\n')).toEqual({ value: 'value', keyRange: [0, 3], valueRange: [6, 11] });
    expect(field('k=a\\\n  b\nx=1')).toEqual({ value: 'ab', keyRange: [0, 1], valueRange: [2, 8] });
  });

  it('reads CRLF line endings, also in continued lines', () => {
    expect(summary('a=1\r\nb=2\\\r\n  3\r\n')).toEqual([
      [['a'], '1'],
      [['b'], '23'],
    ]);
    expect(field('a=1\r\nb=2\r\n')?.valueRange).toEqual([2, 3]);
  });

  it('reads a text without entries', () => {
    expect(parseProperties('')).toEqual({ entries: [], problems: [], topLevelKeys: [] });
    expect(parseProperties('# only a comment\n')).toEqual({ entries: [], problems: [], topLevelKeys: [] });
  });
});
