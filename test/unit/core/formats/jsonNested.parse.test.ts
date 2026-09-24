import { describe, expect, it } from 'vitest';
import { hasSyntaxError } from '../../../../src/core/formats/adapter';
import { jsonNestedAdapter } from '../../../../src/core/formats/json/jsonNested';
import { VALUE_FIELD } from '../../../../src/core/model/types';

function parse(text: string) {
  return jsonNestedAdapter.parse({ text, encoding: 'utf-8', bom: false });
}

const summary = (text: string) =>
  parse(text).entries.map((entry) => [entry.key.segments, entry.fields[VALUE_FIELD]?.value]);

describe('jsonNestedAdapter.parse', () => {
  it('keeps dotted and slashed key segments intact', () => {
    expect(summary('{"A":{"mail.smtp.server":"SMTP"},"MIME":{"application/vnd.ms-excel":"Excel"}}')).toEqual([
      [['A', 'mail.smtp.server'], 'SMTP'],
      [['MIME', 'application/vnd.ms-excel'], 'Excel'],
    ]);
  });

  it('keeps file order and lists the top-level keys', () => {
    const parsed = parse('{"a":"x","b":{"c":"y"},"e":{}}');
    expect(parsed.entries.map((entry) => entry.key.segments)).toEqual([['a'], ['b', 'c']]);
    expect(parsed.topLevelKeys).toEqual(['a', 'b', 'e']);
    expect(parsed.problems).toEqual([]);
  });

  it('accepts an empty object', () => {
    expect(parse('{}\n')).toEqual({ entries: [], problems: [], topLevelKeys: [] });
  });

  it('returns cooked string values', () => {
    expect(summary('{"a":"Zeile\\nzwei \\u00e4"}')).toEqual([[['a'], 'Zeile\nzwei ä']]);
  });

  it('records the ranges of key and value, including the quotes', () => {
    const field = parse('{"a":"x"}').entries[0]?.fields[VALUE_FIELD];
    expect(field?.keyRange).toEqual([1, 4]);
    expect(field?.valueRange).toEqual([5, 8]);
  });

  it('reports values that are not strings', () => {
    const parsed = parse('{"a":1,"b":["x"]}');
    expect(parsed.entries).toEqual([]);
    expect(parsed.problems.map((problem) => [problem.code, problem.key?.segments])).toEqual([
      ['non-string-value', ['a']],
      ['non-string-value', ['b']],
    ]);
  });

  it('lets the last duplicate win, like JSON.parse', () => {
    const parsed = parse('{"a":"x","a":"y"}');
    expect(parsed.entries.map((entry) => entry.fields[VALUE_FIELD]?.value)).toEqual(['y']);
    expect(parsed.problems.map((problem) => [problem.code, problem.range])).toEqual([
      ['duplicate-key', [9, 12]],
    ]);
  });

  it('drops the whole earlier subtree of a duplicated object key', () => {
    expect(summary('{"A":{"x":"1"},"A":{"y":"2"}}')).toEqual([[['A', 'y'], '2']]);
  });

  it('reports syntax errors with their position', () => {
    const problems = parse('{"a": }').problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'parse-error', detail: 'ValueExpected' });
    expect(problems[0]?.range[0]).toBe(6);
  });

  it('detects duplicates per object only', () => {
    expect(parse('{"a":{"x":"1"},"b":{"x":"2"}}').problems).toEqual([]);
    expect(parse('{"a":{"b":"x","b":"y"}}').problems.map((p) => [p.code, p.key?.segments])).toEqual([
      ['duplicate-key', ['a', 'b']],
    ]);
  });

  it('keeps the first position of a duplicated key, like JSON.parse', () => {
    expect(summary('{"a":"x","b":"y","a":"z"}')).toEqual([
      [['a'], 'z'],
      [['b'], 'y'],
    ]);
    expect(summary('{"a":{"c":"x"},"b":"y","a":"z"}')).toEqual([
      [['a'], 'z'],
      [['b'], 'y'],
    ]);
  });

  it('ignores problems inside a value that a later duplicate replaces', () => {
    const parsed = parse('{"a":1,"b":{"c":2,"c":"x"},"a":"y","b":"z"}');
    expect(parsed.problems.map((p) => [p.code, p.key?.segments])).toEqual([
      ['duplicate-key', ['a']],
      ['duplicate-key', ['b']],
    ]);
    expect(parsed.topLevelKeys).toEqual(['a', 'b']);
  });

  it('reports only the first syntax error and returns no entries', () => {
    for (const text of ['{"a":"x","b": }', '{"a":"x",}', '{"a":"say "hi""}']) {
      const parsed = parse(text);
      expect(
        parsed.problems.map((p) => p.code),
        text,
      ).toEqual(['parse-error']);
      expect(parsed.entries, text).toEqual([]);
      expect(parsed.topLevelKeys, text).toEqual([]);
    }
  });

  it('treats an empty file as having no content, like the Angular HTTP client', () => {
    expect(parse('')).toEqual({ entries: [], problems: [], topLevelKeys: [] });
  });

  it('reports extremely deep nesting instead of overflowing the stack', () => {
    const depth = 20000;
    const parsed = parse(`${'{"a":'.repeat(depth)}"x"${'}'.repeat(depth)}`);
    expect(parsed.problems.map((p) => [p.code, p.detail])).toEqual([['parse-error', 'TooDeep']]);
  });

  it('marks files with syntax errors', () => {
    expect(hasSyntaxError(parse('{"a": }'))).toBe(true);
    expect(hasSyntaxError(parse('{"a":1}'))).toBe(false);
  });

  it('requires an object at the top level', () => {
    expect(parse('["a"]').problems.map((problem) => problem.code)).toEqual(['parse-error']);
  });

  it('reports files that are not UTF-8', () => {
    const parsed = jsonNestedAdapter.parse({ text: '{"a":"ü"}', encoding: 'latin-1', bom: false });
    expect(parsed.problems.map((problem) => problem.code)).toEqual(['not-utf8']);
    expect(parsed.entries).toHaveLength(1);
  });

  it('decodes bytes with the shared text decoder', () => {
    expect(jsonNestedAdapter.decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toEqual({
      text: '{}',
      encoding: 'utf-8',
      bom: true,
    });
  });
});
