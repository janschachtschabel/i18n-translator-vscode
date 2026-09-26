import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileOp } from '../../../../src/core/formats/adapter';
import { propertiesAdapter } from '../../../../src/core/formats/properties/properties';
import { keyFromSegments } from '../../../../src/core/model/keys';
import { encodeText } from '../../../../src/core/text/encode';
import { detectStyle, type TextStyle } from '../../../../src/core/text/style';

/**
 * The operation table of Task 5.2 on every golden file. Each file holds ORIGINAL in its own layout (UTF-8 with LF;
 * ISO-8859-1 with CRLF; a byte order mark without final line break); the expected texts are converted to that
 * layout, so nothing but the affected lines may change.
 */
const GOLDEN_FILES = ['utf8.properties', 'latin1-crlf.properties', 'bom-no-final-newline.properties'];

const ORIGINAL = `# Kopfzeile
alpha: Erster Text
beta: Zweiter Text mit ä
gamma: fortgesetzter \\
    Text
delta: Letzter
`;

const key = (name: string) => keyFromSegments([name]);

const CASES: { name: string; ops: FileOp[]; expected: string }[] = [
  { name: 'nothing changes', ops: [], expected: ORIGINAL },
  {
    name: 'set changes one line',
    ops: [{ kind: 'set', key: key('beta'), value: 'Neu, mit ö' }],
    expected: ORIGINAL.replace('beta: Zweiter Text mit ä', 'beta: Neu, mit ö'),
  },
  {
    name: 'set on a continued value writes it on one line',
    ops: [{ kind: 'set', key: key('gamma'), value: 'kurz' }],
    expected: ORIGINAL.replace('gamma: fortgesetzter \\\n    Text', 'gamma: kurz'),
  },
  {
    name: 'insert after a definition adds one line with its separator',
    ops: [{ kind: 'insert', key: key('neu'), value: '9', after: key('alpha') }],
    expected: ORIGINAL.replace('alpha: Erster Text\n', 'alpha: Erster Text\nneu: 9\n'),
  },
  {
    name: 'insert first goes below the comment',
    ops: [{ kind: 'insert', key: key('neu'), value: '9', first: true }],
    expected: ORIGINAL.replace('# Kopfzeile\n', '# Kopfzeile\nneu: 9\n'),
  },
  {
    name: 'insert without anchor goes last',
    ops: [{ kind: 'insert', key: key('neu'), value: '9' }],
    expected: ORIGINAL.replace('delta: Letzter\n', 'delta: Letzter\nneu: 9\n'),
  },
  {
    name: 'delete in the middle removes one line',
    ops: [{ kind: 'delete', key: key('beta') }],
    expected: ORIGINAL.replace('beta: Zweiter Text mit ä\n', ''),
  },
  {
    name: 'delete of a continued definition removes its lines',
    ops: [{ kind: 'delete', key: key('gamma') }],
    expected: ORIGINAL.replace('gamma: fortgesetzter \\\n    Text\n', ''),
  },
  {
    name: 'delete at the end removes the last line',
    ops: [{ kind: 'delete', key: key('delta') }],
    expected: ORIGINAL.replace('delta: Letzter\n', ''),
  },
  {
    name: 'rename changes one line',
    ops: [{ kind: 'rename', from: key('alpha'), to: key('omega') }],
    expected: ORIGINAL.replace('alpha:', 'omega:'),
  },
];

/** A text written with LF, in the line breaks of a file. */
function inLayout(text: string, style: TextStyle): string {
  return text.slice(0, -1).split('\n').join(style.eol) + (style.finalNewline ? style.eol : '');
}

describe.each(GOLDEN_FILES)('golden file %s', (name) => {
  const bytes = readFileSync(join(__dirname, '..', '..', '..', 'fixtures', 'golden', 'properties', name));
  const decoded = propertiesAdapter.decode(bytes);
  const style = detectStyle(decoded.text);

  it('holds the original in its own layout', () => {
    expect(decoded.text).toBe(inLayout(ORIGINAL, style));
  });

  it('writes the same bytes when nothing changes', () => {
    expect(Buffer.from(propertiesAdapter.encode(propertiesAdapter.applyOps(decoded, [])))).toEqual(bytes);
  });

  it.each(CASES)('$name', ({ ops, expected }) => {
    const written = propertiesAdapter.encode(propertiesAdapter.applyOps(decoded, ops));
    // Bytes rather than the decoded text: a file left with plain ASCII reads as UTF-8, whatever it was.
    expect(Buffer.from(written)).toEqual(
      Buffer.from(encodeText({ ...decoded, text: inLayout(expected, style) })),
    );
  });
});

describe('golden file latin1-crlf.properties', () => {
  it('writes a character beyond ISO-8859-1 as a \\u escape and keeps the rest', () => {
    const bytes = readFileSync(
      join(__dirname, '..', '..', '..', 'fixtures', 'golden', 'properties', 'latin1-crlf.properties'),
    );
    const decoded = propertiesAdapter.decode(bytes);
    const written = propertiesAdapter.encode(
      propertiesAdapter.applyOps(decoded, [{ kind: 'set', key: key('delta'), value: '5 €' }]),
    );
    expect(decoded.encoding).toBe('latin-1');
    expect(Buffer.from(written).toString('latin1')).toBe(
      Buffer.from(bytes).toString('latin1').replace('delta: Letzter', 'delta: 5 \\u20ac'),
    );
  });
});
