import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EditError, type FileOp } from '../../../../src/core/formats/adapter';
import { jsonNestedAdapter } from '../../../../src/core/formats/json/jsonNested';
import { keyFromSegments, type EntryKey } from '../../../../src/core/model/keys';
import { VALUE_FIELD } from '../../../../src/core/model/types';

const key = (dotted: string): EntryKey => keyFromSegments(dotted.split('.'));
const doc = (text: string) => ({ text, encoding: 'utf-8' as const, bom: false });
const apply = (text: string, ...ops: FileOp[]) => jsonNestedAdapter.applyOps(doc(text), ops).text;
const valueOf = (text: string, segments: string[]) =>
  jsonNestedAdapter.parse(doc(text)).entries.find((entry) => entry.key.id === keyFromSegments(segments).id)
    ?.fields[VALUE_FIELD]?.value;

/** The lines that differ between two texts, after removing the common start and end. */
function changedLines(before: string, after: string): { removed: string[]; added: string[] } {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return { removed: a.slice(start, endA), added: b.slice(start, endB) };
}

const NESTED = '{\n  "A": {\n    "FIRST": "1",\n    "LAST": "2"\n  },\n  "B": "x"\n}\n';
const golden = (name: string) =>
  readFileSync(join(__dirname, '..', '..', '..', 'fixtures', 'golden', 'json', name));
const fixture = (path: string) =>
  readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      'fixtures',
      'workspace-basic',
      'Frontend',
      'src',
      'assets',
      'i18n',
      path,
    ),
  );

describe('jsonNestedAdapter.applyOps and encode', () => {
  it('writes files back byte for byte when nothing changes', () => {
    for (const bytes of [
      golden('crlf-bom.json'),
      golden('tabs.json'),
      golden('no-final-newline.json'),
      fixture('common/de.json'),
    ]) {
      const decoded = jsonNestedAdapter.decode(bytes);
      expect(Buffer.from(jsonNestedAdapter.encode(jsonNestedAdapter.applyOps(decoded, [])))).toEqual(bytes);
    }
  });

  describe('set', () => {
    it('changes exactly one line', () => {
      const before = fixture('common/de.json').toString('utf8');
      const after = apply(before, { kind: 'set', key: key('WORKSPACE.FILE.TITLE'), value: 'Dokument' });
      expect(changedLines(before, after)).toEqual({
        removed: ['      "TITLE": "Datei"'],
        added: ['      "TITLE": "Dokument"'],
      });
    });

    it('finds keys whose segments contain dots or slashes', () => {
      const text =
        '{\n  "MAIL": {\n    "mail.smtp.server": "a"\n  },\n  "MIME": {\n    "application/pdf": "b"\n  }\n}\n';
      let after = apply(text, {
        kind: 'set',
        key: keyFromSegments(['MAIL', 'mail.smtp.server']),
        value: 'A',
      });
      after = apply(after, { kind: 'set', key: keyFromSegments(['MIME', 'application/pdf']), value: 'B' });
      expect(after).toBe(
        '{\n  "MAIL": {\n    "mail.smtp.server": "A"\n  },\n  "MIME": {\n    "application/pdf": "B"\n  }\n}\n',
      );
    });

    it('keeps any text intact through writing and parsing again', () => {
      for (const value of [
        'Sag "Hallo"',
        'C:\\temp\\x',
        'Zeile 1\nZeile 2\t!',
        'Größe · 😀',
        'a\u2028b',
        '',
      ]) {
        expect(valueOf(apply(NESTED, { kind: 'set', key: key('B'), value }), ['B'])).toBe(value);
      }
    });

    it('escapes line and paragraph separators, which editors offer to remove', () => {
      const [ls, ps] = [String.fromCharCode(0x2028), String.fromCharCode(0x2029)];
      const after = apply(NESTED, { kind: 'set', key: key('B'), value: `a${ls}b${ps}c` });
      expect(after).toContain('"B": "a\\u2028b\\u2029c"');
      expect(valueOf(after, ['B'])).toBe(`a${ls}b${ps}c`);
      const inserted = apply(NESTED, { kind: 'insert', key: keyFromSegments([`L${ls}S`]), value: 'v' });
      expect(inserted).toContain('"L\\u2028S": "v"');
    });

    it('changes the definition that applies when a key is duplicated', () => {
      expect(apply('{\n  "A": "1",\n  "A": "2"\n}\n', { kind: 'set', key: key('A'), value: '3' })).toBe(
        '{\n  "A": "1",\n  "A": "3"\n}\n',
      );
    });
  });

  describe('insert', () => {
    it('adds one line after the sibling in the middle of an object', () => {
      expect(apply(NESTED, { kind: 'insert', key: key('A.NEW'), value: 'n', after: key('A.FIRST') })).toBe(
        '{\n  "A": {\n    "FIRST": "1",\n    "NEW": "n",\n    "LAST": "2"\n  },\n  "B": "x"\n}\n',
      );
    });

    it('adds a comma to the last sibling and the new line after it', () => {
      expect(apply(NESTED, { kind: 'insert', key: key('A.NEW'), value: 'n', after: key('A.LAST') })).toBe(
        '{\n  "A": {\n    "FIRST": "1",\n    "LAST": "2",\n    "NEW": "n"\n  },\n  "B": "x"\n}\n',
      );
    });

    it('appends to the object without a sibling or with a sibling of another object', () => {
      const expected =
        '{\n  "A": {\n    "FIRST": "1",\n    "LAST": "2",\n    "NEW": "n"\n  },\n  "B": "x"\n}\n';
      expect(apply(NESTED, { kind: 'insert', key: key('A.NEW'), value: 'n' })).toBe(expected);
      expect(apply(NESTED, { kind: 'insert', key: key('A.NEW'), value: 'n', after: key('B') })).toBe(
        expected,
      );
    });

    it('fills empty objects', () => {
      expect(apply('{}\n', { kind: 'insert', key: key('A'), value: 'n' })).toBe('{\n  "A": "n"\n}\n');
      expect(apply('{\n  "A": {}\n}\n', { kind: 'insert', key: key('A.B'), value: 'n' })).toBe(
        '{\n  "A": {\n    "B": "n"\n  }\n}\n',
      );
      expect(apply('', { kind: 'insert', key: key('A'), value: 'n' })).toBe('{\n  "A": "n"\n}\n');
    });

    it('creates missing parent objects in the style of the file', () => {
      expect(
        apply(NESTED, { kind: 'insert', key: key('A.SUB.DEEP'), value: 'n', after: key('A.FIRST') }),
      ).toBe(
        '{\n  "A": {\n    "FIRST": "1",\n    "SUB": {\n      "DEEP": "n"\n    },\n    "LAST": "2"\n  },\n  "B": "x"\n}\n',
      );
      expect(apply(NESTED, { kind: 'insert', key: key('C.D'), value: 'n' })).toBe(
        '{\n  "A": {\n    "FIRST": "1",\n    "LAST": "2"\n  },\n  "B": "x",\n  "C": {\n    "D": "n"\n  }\n}\n',
      );
    });

    it('leaves oddly formatted neighbours alone', () => {
      expect(
        apply('{\n  "A":"1" ,\n  "B" :  "2"\n}\n', {
          kind: 'insert',
          key: key('NEW'),
          value: 'n',
          after: key('A'),
        }),
      ).toBe('{\n  "A":"1" ,\n  "NEW": "n",\n  "B" :  "2"\n}\n');
    });

    it('uses the line ending and indentation of the file', () => {
      const tabs = golden('tabs.json').toString('utf8');
      const after = apply(tabs, { kind: 'insert', key: key('B.NEW'), value: 'n' });
      expect(changedLines(tabs, after).added).toContain('\t\t"NEW": "n"');
      expect(
        apply('{\r\n  "A": "1"\r\n}\r\n', { kind: 'insert', key: key('NEW'), value: 'n', after: key('A') }),
      ).toBe('{\r\n  "A": "1",\r\n  "NEW": "n"\r\n}\r\n');
    });

    it('stays valid in objects written on one line', () => {
      const after = apply('{"A":"1","B":"2"}', {
        kind: 'insert',
        key: key('NEW'),
        value: 'n',
        after: key('A'),
      });
      expect(valueOf(after, ['NEW'])).toBe('n');
      expect(jsonNestedAdapter.parse(doc(after)).entries.map((entry) => entry.key.segments[0])).toEqual([
        'A',
        'NEW',
        'B',
      ]);
    });
  });

  describe('delete', () => {
    it('removes a line in the middle', () => {
      expect(apply(NESTED, { kind: 'delete', key: key('A.FIRST') })).toBe(
        '{\n  "A": {\n    "LAST": "2"\n  },\n  "B": "x"\n}\n',
      );
    });

    it('removes the comma of the line before when the last key goes', () => {
      expect(apply(NESTED, { kind: 'delete', key: key('A.LAST') })).toBe(
        '{\n  "A": {\n    "FIRST": "1"\n  },\n  "B": "x"\n}\n',
      );
      expect(apply(NESTED, { kind: 'delete', key: key('B') })).toBe(
        '{\n  "A": {\n    "FIRST": "1",\n    "LAST": "2"\n  }\n}\n',
      );
    });

    it('removes objects that become empty, but keeps the top level', () => {
      const text = '{\n  "A": {\n    "B": {\n      "C": "1"\n    }\n  },\n  "D": "2"\n}\n';
      expect(apply(text, { kind: 'delete', key: key('A.B.C') })).toBe('{\n  "D": "2"\n}\n');
      expect(apply('{\n  "A": "1"\n}\n', { kind: 'delete', key: key('A') })).toBe('{}\n');
    });

    it('removes every definition of a duplicated key', () => {
      expect(apply('{\n  "A": "1",\n  "B": "2",\n  "A": "3"\n}\n', { kind: 'delete', key: key('A') })).toBe(
        '{\n  "B": "2"\n}\n',
      );
    });

    it('stays valid in objects written on one line', () => {
      expect(apply('{"A":"1","B":"2"}', { kind: 'delete', key: key('A') })).toBe('{"B":"2"}');
      expect(apply('{"A":"1","B":"2"}', { kind: 'delete', key: key('B') })).toBe('{"A":"1"}');
    });
  });

  describe('rename', () => {
    it('changes only the key within the same object', () => {
      expect(apply(NESTED, { kind: 'rename', from: key('A.FIRST'), to: key('A.START') })).toBe(
        '{\n  "A": {\n    "START": "1",\n    "LAST": "2"\n  },\n  "B": "x"\n}\n',
      );
    });

    it('moves the text to another object', () => {
      expect(apply(NESTED, { kind: 'rename', from: key('A.FIRST'), to: key('C.FIRST') })).toBe(
        '{\n  "A": {\n    "LAST": "2"\n  },\n  "B": "x",\n  "C": {\n    "FIRST": "1"\n  }\n}\n',
      );
    });

    it('renames every definition of a duplicated key, so that no hidden text comes back', () => {
      const duplicated = '{\n  "A": "1",\n  "B": "2",\n  "A": "3"\n}\n';
      expect(apply(duplicated, { kind: 'rename', from: key('A'), to: key('C') })).toBe(
        '{\n  "B": "2",\n  "C": "3"\n}\n',
      );
      expect(apply(duplicated, { kind: 'rename', from: key('A'), to: key('X.C') })).toBe(
        '{\n  "B": "2",\n  "X": {\n    "C": "3"\n  }\n}\n',
      );
    });

    it('leaves the file alone when the name does not change', () => {
      expect(apply(NESTED, { kind: 'rename', from: key('B'), to: key('B') })).toBe(NESTED);
    });
  });

  it('applies several operations in order', () => {
    expect(
      apply(
        NESTED,
        { kind: 'set', key: key('B'), value: 'y' },
        { kind: 'insert', key: key('A.NEW'), value: 'n', after: key('A.FIRST') },
        { kind: 'delete', key: key('A.LAST') },
      ),
    ).toBe('{\n  "A": {\n    "FIRST": "1",\n    "NEW": "n"\n  },\n  "B": "y"\n}\n');
  });

  it('rejects impossible operations with a code', () => {
    const codeOf = (text: string, op: FileOp) => {
      try {
        apply(text, op);
        return 'none';
      } catch (error) {
        return error instanceof EditError ? error.code : String(error);
      }
    };
    expect(codeOf(NESTED, { kind: 'set', key: key('A.MISSING'), value: 'x' })).toBe('missing-key');
    expect(codeOf(NESTED, { kind: 'set', key: key('A'), value: 'x' })).toBe('path-conflict');
    expect(codeOf(NESTED, { kind: 'delete', key: key('C') })).toBe('missing-key');
    expect(codeOf(NESTED, { kind: 'insert', key: key('A.FIRST'), value: 'x' })).toBe('key-exists');
    expect(codeOf(NESTED, { kind: 'insert', key: key('B.C'), value: 'x' })).toBe('path-conflict');
    expect(codeOf(NESTED, { kind: 'rename', from: key('A.FIRST'), to: key('A.LAST') })).toBe('key-exists');
    expect(codeOf(NESTED, { kind: 'rename', from: key('A.MISSING'), to: key('A.X') })).toBe('missing-key');
    expect(codeOf(NESTED, { kind: 'rename', from: key('A'), to: key('Z') })).toBe('path-conflict');
    expect(codeOf(NESTED, { kind: 'delete', key: key('A') })).toBe('path-conflict');
    expect(codeOf('{"A": }', { kind: 'set', key: key('A'), value: 'x' })).toBe('unparsable');
    // Like the reader: only a file without any content counts as an empty object.
    expect(codeOf('\n', { kind: 'insert', key: key('A'), value: 'x' })).toBe('unparsable');
    // Also like the reader: nesting deep enough to overflow the parser's stack is unreadable, not a crash.
    const depth = 20000;
    const deep = `${'{"a":'.repeat(depth)}"x"${'}'.repeat(depth)}`;
    expect(codeOf(deep, { kind: 'set', key: key('a'), value: 'y' })).toBe('unparsable');
  });

  it('reports an existing object as a path conflict and any other existing value as an existing key', () => {
    const codeOf = (text: string, op: FileOp) => {
      try {
        apply(text, op);
        return 'none';
      } catch (error) {
        return error instanceof EditError ? `${error.code}: ${error.message}` : String(error);
      }
    };
    expect(codeOf(NESTED, { kind: 'rename', from: key('B'), to: key('A') })).toBe(
      'path-conflict: A is an object in this file.',
    );
    expect(codeOf(NESTED, { kind: 'insert', key: key('A'), value: 'x' })).toBe(
      'path-conflict: A is an object in this file.',
    );
    expect(codeOf('{\n  "N": 5\n}\n', { kind: 'insert', key: key('N'), value: 'x' })).toBe(
      'key-exists: N already exists in this file.',
    );
    expect(codeOf('{\n  "N": 5\n}\n', { kind: 'set', key: key('N'), value: 'x' })).toBe(
      'path-conflict: N is not a text.',
    );
    expect(codeOf('{\n  "N": null\n}\n', { kind: 'insert', key: key('N.X'), value: 'x' })).toBe(
      'path-conflict: N is not an object.',
    );
  });

  it('encodes UTF-8 with the byte order mark it was read with', () => {
    const decoded = jsonNestedAdapter.decode(golden('crlf-bom.json'));
    const bytes = jsonNestedAdapter.encode(
      jsonNestedAdapter.applyOps(decoded, [{ kind: 'set', key: key('A'), value: 'ä' }]),
    );
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(valueOf(jsonNestedAdapter.decode(bytes).text, ['A'])).toBe('ä');
  });

  it('writes characters beyond ISO-8859-1 as escapes in files that are not UTF-8', () => {
    const original = Uint8Array.from('{\n  "A": "Größe",\n  "B": "x"\n}\n', (char) => char.charCodeAt(0));
    const decoded = jsonNestedAdapter.decode(original);
    expect(decoded.encoding).toBe('latin-1');
    const value = '„Preis“ 5 € – 😀';
    const bytes = jsonNestedAdapter.encode(
      jsonNestedAdapter.applyOps(decoded, [{ kind: 'set', key: key('B'), value }]),
    );
    const reread = jsonNestedAdapter.decode(bytes);
    expect(reread.encoding).toBe('latin-1');
    expect(changedLines(decoded.text, reread.text)).toEqual({
      removed: ['  "B": "x"'],
      added: ['  "B": "\\u201ePreis\\u201c 5 \\u20ac \\u2013 \\ud83d\\ude00"'],
    });
    expect(valueOf(reread.text, ['B'])).toBe(value);
  });

  it('creates new files as an empty object in the given style', () => {
    expect(jsonNestedAdapter.createEmpty()).toBe('{}\n');
    expect(jsonNestedAdapter.createEmpty({ eol: '\r\n', indent: '\t', finalNewline: true })).toBe('{}\r\n');
  });
});
