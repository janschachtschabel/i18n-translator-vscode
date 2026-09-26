import { describe, expect, it } from 'vitest';
import { EditError, type FileOp } from '../../../../src/core/formats/adapter';
import { propertiesAdapter } from '../../../../src/core/formats/properties/properties';
import { keyFromSegments } from '../../../../src/core/model/keys';
import { VALUE_FIELD } from '../../../../src/core/model/types';

const key = (name: string) => keyFromSegments([name]);
const doc = (text: string, encoding: 'utf-8' | 'latin-1' = 'utf-8') => ({ text, encoding, bom: false });
const apply = (text: string, ...ops: FileOp[]) => propertiesAdapter.applyOps(doc(text), ops).text;
const set = (name: string, value: string): FileOp => ({ kind: 'set', key: key(name), value });
const valueOf = (text: string, name: string) =>
  propertiesAdapter.parse(doc(text)).entries.find((entry) => entry.key.segments[0] === name)?.fields[
    VALUE_FIELD
  ]?.value;

function editError(run: () => unknown): EditError {
  try {
    run();
  } catch (error) {
    if (error instanceof EditError) {
      return error;
    }
    throw error;
  }
  throw new Error('No EditError was thrown.');
}

describe('propertiesAdapter.applyOps: set', () => {
  it('replaces only the value and keeps key, separator and neighbors', () => {
    expect(apply('a = 1\nb: 2\nc=3\n', set('b', 'neu'))).toBe('a = 1\nb: neu\nc=3\n');
  });

  it('writes a continued value on one line', () => {
    expect(apply('a=first \\\n    second\nb=2\n', set('a', 'x'))).toBe('a=x\nb=2\n');
  });

  it('changes the definition that applies when a key repeats', () => {
    expect(apply('a=1\na=2\n', set('a', 'x'))).toBe('a=1\na=x\n');
  });

  it('escapes backslashes, line breaks, tabs and a leading space', () => {
    expect(apply('a=1\n', set('a', 'a\\b'))).toBe('a=a\\\\b\n');
    expect(apply('a=1\n', set('a', 'line\nbreak\r\tend'))).toBe('a=line\\nbreak\\r\\tend\n');
    expect(apply('a=1\n', set('a', ' x y'))).toBe('a=\\ x y\n');
  });

  it('escapes a leading "=" or ":" only where white space alone separates key and value', () => {
    expect(apply('c 3\n', set('c', '=x'))).toBe('c \\=x\n');
    expect(apply('c=3\n', set('c', ':x'))).toBe('c=:x\n');
    expect(valueOf(apply('c 3\n', set('c', '=x')), 'c')).toBe('=x');
    expect(valueOf(apply('c=3\n', set('c', ':x')), 'c')).toBe(':x');
  });

  it('replaces a backslash the file ends in when an empty value gets a text', () => {
    expect(apply('hint=\\', set('hint', 'user list'))).toBe('hint=user list');
    expect(apply('hint=\\\n', set('hint', 'tab'))).toBe('hint=tab\n');
  });

  it('writes line and paragraph separators as escapes, since editors offer to remove them', () => {
    const value = `x${String.fromCharCode(0x2028)}y${String.fromCharCode(0x2029)}z`;
    const written = apply('a=1\n', set('a', value));
    expect(written).toBe('a=x\\u2028y\\u2029z\n');
    expect(valueOf(written, 'a')).toBe(value);
  });

  it('writes values that read back unchanged', () => {
    for (const value of [
      'back\\slash',
      'line\nbreak',
      ' leading',
      '#hash',
      '!bang',
      'tab\tx',
      'end\\',
      'ä €',
      '😀',
    ]) {
      expect(valueOf(apply('a=1\n', set('a', value)), 'a')).toBe(value);
    }
  });
});

describe('propertiesAdapter.applyOps: insert', () => {
  it('adds a line after the anchor, with the separator of the anchor line', () => {
    expect(apply('a: 1\nb=2\n', { kind: 'insert', key: key('n'), value: '9', after: key('a') })).toBe(
      'a: 1\nn: 9\nb=2\n',
    );
  });

  it('adds a line before the first definition, below a leading comment', () => {
    expect(apply('# head\na = 1\n', { kind: 'insert', key: key('n'), value: '9', first: true })).toBe(
      '# head\nn = 9\na = 1\n',
    );
  });

  it('adds a line after the last definition when there is no anchor', () => {
    expect(apply('a=1\n# tail\n', { kind: 'insert', key: key('n'), value: '9' })).toBe('a=1\nn=9\n# tail\n');
  });

  it('writes into an empty file, a file of comments and a file without a final line break', () => {
    expect(apply('', { kind: 'insert', key: key('n'), value: '9' })).toBe('n=9\n');
    expect(apply('# c\n', { kind: 'insert', key: key('n'), value: '9' })).toBe('# c\nn=9\n');
    expect(apply('a=1', { kind: 'insert', key: key('n'), value: '9', after: key('a') })).toBe('a=1\nn=9');
    expect(apply('a=1\nb=2', { kind: 'insert', key: key('n'), value: '9', after: key('a') })).toBe(
      'a=1\nn=9\nb=2',
    );
  });

  it('keeps the line breaks of the file', () => {
    expect(apply('a=1\r\nb=2\r\n', { kind: 'insert', key: key('n'), value: '9', after: key('a') })).toBe(
      'a=1\r\nn=9\r\nb=2\r\n',
    );
  });

  it('goes after the logical line of a continued anchor', () => {
    expect(apply('a=x\\\n  y\nb=2\n', { kind: 'insert', key: key('n'), value: '9', after: key('a') })).toBe(
      'a=x\\\n  y\nn=9\nb=2\n',
    );
  });

  it('escapes the characters that would end or hide a key', () => {
    const text = apply('a=1\n', { kind: 'insert', key: key('#x y=z:w!'), value: '9', after: key('a') });
    expect(text).toBe('a=1\n\\#x\\ y\\=z\\:w\\!=9\n');
    expect(valueOf(text, '#x y=z:w!')).toBe('9');
  });

  it('keeps a backslash the file ends in from continuing into the new line', () => {
    for (const text of ['dir=C:\\', 'dir=C:\\\n']) {
      const written = apply(text, { kind: 'insert', key: key('neu'), value: '9', after: key('dir') });
      expect(written, text).toBe(text.endsWith('\n') ? 'dir=C:\\\n\nneu=9\n' : 'dir=C:\\\n\nneu=9');
      expect(valueOf(written, 'dir')).toBe('C:');
      expect(valueOf(written, 'neu')).toBe('9');
    }
  });

  it('writes "=" for an empty key, where white space alone would make the value the key', () => {
    const written = apply('a 1\n', { kind: 'insert', key: key(''), value: 'v', after: key('a') });
    expect(written).toBe('a 1\n=v\n');
    expect(valueOf(written, '')).toBe('v');
  });

  it('uses "=" when the anchor has no separator on its own line', () => {
    expect(apply('a=\\\n  x\n', { kind: 'insert', key: key('n'), value: '9', after: key('a') })).toBe(
      'a=\\\n  x\nn=9\n',
    );
  });
});

describe('propertiesAdapter.applyOps: delete and rename', () => {
  it('removes every definition with its line', () => {
    expect(apply('a=1\nb=2\na=3\n', { kind: 'delete', key: key('a') })).toBe('b=2\n');
  });

  it('removes all lines of a continued definition', () => {
    expect(apply('a=x\\\n  y\nb=2\n', { kind: 'delete', key: key('a') })).toBe('b=2\n');
  });

  it('keeps a file without a final line break without one', () => {
    expect(apply('a=1\nb=2', { kind: 'delete', key: key('b') })).toBe('a=1');
    expect(apply('a=1', { kind: 'delete', key: key('a') })).toBe('');
  });

  it('renames the definition that applies and drops the earlier ones', () => {
    expect(apply('a=1\nb=2\na=3\n', { kind: 'rename', from: key('a'), to: key('c') })).toBe('b=2\nc=3\n');
    expect(apply('a: 1\n', { kind: 'rename', from: key('a'), to: key('x y') })).toBe('x\\ y: 1\n');
  });
});

describe('propertiesAdapter.applyOps: refusals', () => {
  it('refuses operations that do not fit the file', () => {
    expect(editError(() => apply('a=1\n', set('b', 'x'))).code).toBe('missing-key');
    expect(editError(() => apply('a=1\n', { kind: 'insert', key: key('a'), value: 'x' })).code).toBe(
      'key-exists',
    );
    expect(editError(() => apply('a=1\n', { kind: 'delete', key: key('b') })).code).toBe('missing-key');
    expect(editError(() => apply('a=1\nb=2\n', { kind: 'rename', from: key('a'), to: key('b') })).code).toBe(
      'key-exists',
    );
    expect(editError(() => apply('a=\\u12\n', set('a', 'x'))).code).toBe('unparsable');
  });

  it('names the key of a refused operation', () => {
    expect(editError(() => apply('a=1\n', set('b', 'x'))).key).toEqual(key('b'));
  });
});

describe('propertiesAdapter: encoding', () => {
  it('keeps ISO-8859-1 and writes characters beyond it as \\u escapes', () => {
    const written = propertiesAdapter.applyOps(doc('a=1\n', 'latin-1'), [set('a', 'ä€')]);
    const bytes = propertiesAdapter.encode(written);
    expect([...bytes]).toEqual([...Buffer.from('a=\u00e4\\u20ac\n', 'latin1')]);
    expect(
      propertiesAdapter.parse(propertiesAdapter.decode(bytes)).entries[0]?.fields[VALUE_FIELD]?.value,
    ).toBe('ä€');
  });

  it('keeps UTF-8 characters as they are', () => {
    const written = propertiesAdapter.applyOps(doc('a=1\n'), [set('a', 'ä€')]);
    expect(Buffer.from(propertiesAdapter.encode(written)).toString('utf8')).toBe('a=ä€\n');
  });

  it('reads ISO-8859-1 without a finding: Java falls back to it on purpose', () => {
    expect(propertiesAdapter.parse(doc('a=\u00e4\n', 'latin-1')).problems).toEqual([]);
  });

  it('starts a new file empty', () => {
    expect(propertiesAdapter.createEmpty()).toBe('');
  });
});
