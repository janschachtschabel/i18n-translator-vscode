import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileOp } from '../../../../src/core/formats/adapter';
import { jsonNestedAdapter } from '../../../../src/core/formats/json/jsonNested';
import { keyFromSegments } from '../../../../src/core/model/keys';
import { detectStyle, type TextStyle } from '../../../../src/core/text/style';

/**
 * The operation table of Task 2.2 on every golden file. Each file holds ORIGINAL in its own layout (CRLF with a
 * byte order mark, tabs, no final newline); the expected texts are converted to that layout, so nothing but the
 * affected lines may change.
 */
const GOLDEN_FILES = ['crlf-bom.json', 'tabs.json', 'no-final-newline.json'];

const ORIGINAL = `{
  "A": "x",
  "B": {
    "C": "y",
    "D": "z"
  },
  "E": {
    "F": "w"
  }
}
`;

const key = (dotted: string) => keyFromSegments(dotted.split('.'));

const CASES: { name: string; ops: FileOp[]; expected: string }[] = [
  { name: 'nothing changes', ops: [], expected: ORIGINAL },
  {
    name: 'set changes one line',
    ops: [{ kind: 'set', key: key('B.C'), value: 'neu' }],
    expected: ORIGINAL.replace('"C": "y"', '"C": "neu"'),
  },
  {
    name: 'insert after a sibling in the middle adds one line',
    ops: [{ kind: 'insert', key: key('B.NEW'), value: 'n', after: key('B.C') }],
    expected: ORIGINAL.replace('"C": "y",\n', '"C": "y",\n    "NEW": "n",\n'),
  },
  {
    name: 'insert after the last sibling adds one line and a comma',
    ops: [{ kind: 'insert', key: key('B.NEW'), value: 'n', after: key('B.D') }],
    expected: ORIGINAL.replace('"D": "z"\n', '"D": "z",\n    "NEW": "n"\n'),
  },
  {
    name: 'insert with a new parent path creates the objects',
    ops: [{ kind: 'insert', key: key('X.Y'), value: 'n' }],
    expected: ORIGINAL.replace('    "F": "w"\n  }\n', '    "F": "w"\n  },\n  "X": {\n    "Y": "n"\n  }\n'),
  },
  {
    name: 'delete in the middle removes one line',
    ops: [{ kind: 'delete', key: key('B.C') }],
    expected: ORIGINAL.replace('    "C": "y",\n', ''),
  },
  {
    name: 'delete at the end removes the comma of the line before',
    ops: [{ kind: 'delete', key: key('B.D') }],
    expected: ORIGINAL.replace('"C": "y",\n    "D": "z"\n', '"C": "y"\n'),
  },
  {
    name: 'delete of the only child removes the parent object',
    ops: [{ kind: 'delete', key: key('E.F') }],
    expected: ORIGINAL.replace('  },\n  "E": {\n    "F": "w"\n  }\n', '  }\n'),
  },
  {
    name: 'rename within the same object changes one line',
    ops: [{ kind: 'rename', from: key('B.C'), to: key('B.START') }],
    expected: ORIGINAL.replace('"C": "y"', '"START": "y"'),
  },
  {
    name: 'rename into another object moves the line',
    ops: [{ kind: 'rename', from: key('A'), to: key('B.A') }],
    expected: ORIGINAL.replace('  "A": "x",\n', '').replace('"D": "z"\n', '"D": "z",\n    "A": "x"\n'),
  },
];

/** A text written with LF and two spaces per level, in the layout of a file. */
function inLayout(text: string, style: TextStyle): string {
  const lines = text
    .slice(0, -1)
    .split('\n')
    .map((line) => {
      const content = line.trimStart();
      return style.indent.repeat((line.length - content.length) / 2) + content;
    });
  return lines.join(style.eol) + (style.finalNewline ? style.eol : '');
}

describe.each(GOLDEN_FILES)('golden file %s', (name) => {
  const bytes = readFileSync(join(__dirname, '..', '..', '..', 'fixtures', 'golden', 'json', name));
  const decoded = jsonNestedAdapter.decode(bytes);
  const style = detectStyle(decoded.text);

  it('holds the original in its own layout', () => {
    expect(decoded.text).toBe(inLayout(ORIGINAL, style));
  });

  it.each(CASES)('$name', ({ ops, expected }) => {
    const written = jsonNestedAdapter.encode(jsonNestedAdapter.applyOps(decoded, ops));
    expect(jsonNestedAdapter.decode(written)).toEqual({ ...decoded, text: inLayout(expected, style) });
  });
});
