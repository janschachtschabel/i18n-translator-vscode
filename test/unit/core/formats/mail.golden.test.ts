import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileOp } from '../../../../src/core/formats/adapter';
import { mailAdapter } from '../../../../src/core/formats/mail/mail';
import { keyFromSegments } from '../../../../src/core/model/keys';
import { detectStyle, type TextStyle } from '../../../../src/core/text/style';

/**
 * The operation table of Task 6.2 on every golden file. Each file holds ORIGINAL in its own layout (tabs with CRLF;
 * two spaces without final line break); the expected texts are converted to that layout, so nothing but the
 * affected lines may change.
 */
const GOLDEN_FILES = ['tabs-crlf.xml', 'spaces-no-final-newline.xml'];

const ORIGINAL = `<templates>
\t<template name="header">
\t\t<message><![CDATA[
\t\t\t<div>Kopf</div>
\t\t]]>
\t\t</message>
\t</template>
\t<template name="stylesheet">
\t\t<style><![CDATA[
\t\t\tbody{}
\t\t]]></style>
\t</template>
\t<template name="invited">
\t\t<subject>Einladung</subject>
\t\t<message><![CDATA[<p>Hallo {{name}}</p>]]></message>
\t</template>
</templates>
`;

const HEADER = `\t<template name="header">
\t\t<message><![CDATA[
\t\t\t<div>Kopf</div>
\t\t]]>
\t\t</message>
\t</template>
`;

const ADDED = `\t<template name="added">
\t\t<subject>S</subject>
\t</template>
`;

const key = (...segments: string[]) => keyFromSegments(segments);

const CASES: { name: string; ops: FileOp[]; expected: string }[] = [
  { name: 'nothing changes', ops: [], expected: ORIGINAL },
  {
    name: 'set a subject changes one line',
    ops: [{ kind: 'set', key: key('invited', 'subject'), value: 'Neu & mehr' }],
    expected: ORIGINAL.replace('<subject>Einladung</subject>', '<subject>Neu &amp; mehr</subject>'),
  },
  {
    name: 'set a message in a CDATA section with layout changes only its text',
    ops: [{ kind: 'set', key: key('header', 'message'), value: '<div>Neu</div>' }],
    expected: ORIGINAL.replace('<div>Kopf</div>', '<div>Neu</div>'),
  },
  {
    name: 'set a message on one line changes that line',
    ops: [{ kind: 'set', key: key('invited', 'message'), value: '<p>Neu</p>' }],
    expected: ORIGINAL.replace('<p>Hallo {{name}}</p>', '<p>Neu</p>'),
  },
  {
    name: 'insert a field first in its template adds one line',
    ops: [{ kind: 'insert', key: key('header', 'subject'), value: 'S', first: true }],
    expected: ORIGINAL.replace(
      '\t\t<message><![CDATA[\n\t\t\t<div>',
      '\t\t<subject>S</subject>\n\t\t<message><![CDATA[\n\t\t\t<div>',
    ),
  },
  {
    name: 'insert a field after its sibling adds one line',
    ops: [{ kind: 'insert', key: key('header', 'subject'), value: 'S', after: key('header', 'message') }],
    expected: ORIGINAL.replace('\t\t</message>\n', '\t\t</message>\n\t\t<subject>S</subject>\n'),
  },
  {
    name: 'insert a template after the template of the anchor',
    ops: [{ kind: 'insert', key: key('added', 'subject'), value: 'S', after: key('header') }],
    expected: ORIGINAL.replace(HEADER, HEADER + ADDED),
  },
  {
    name: 'insert a template first',
    ops: [{ kind: 'insert', key: key('added', 'subject'), value: 'S', first: true }],
    expected: ORIGINAL.replace(HEADER, ADDED + HEADER),
  },
  {
    name: 'insert a template last',
    ops: [{ kind: 'insert', key: key('added', 'subject'), value: 'S' }],
    expected: ORIGINAL.replace('</templates>', `${ADDED}</templates>`),
  },
  {
    name: 'delete a field removes its line',
    ops: [{ kind: 'delete', key: key('invited', 'subject') }],
    expected: ORIGINAL.replace('\t\t<subject>Einladung</subject>\n', ''),
  },
  {
    name: 'delete the last field removes the template',
    ops: [{ kind: 'delete', key: key('header', 'message') }],
    expected: ORIGINAL.replace(HEADER, ''),
  },
  {
    name: 'rename a field within its template changes its tags',
    ops: [{ kind: 'rename', from: key('header', 'message'), to: key('header', 'subject') }],
    expected: ORIGINAL.replace(
      '\t\t<message><![CDATA[\n\t\t\t<div>',
      '\t\t<subject><![CDATA[\n\t\t\t<div>',
    ).replace(
      '\t\t</message>\n\t</template>\n\t<template name="stylesheet">',
      '\t\t</subject>\n\t</template>\n\t<template name="stylesheet">',
    ),
  },
  {
    name: 'rename into another template moves the field',
    ops: [{ kind: 'rename', from: key('invited', 'subject'), to: key('header', 'subject') }],
    expected: ORIGINAL.replace(
      '\t\t</message>\n\t</template>\n\t<template name="stylesheet">',
      '\t\t</message>\n\t\t<subject>Einladung</subject>\n\t</template>\n\t<template name="stylesheet">',
    ).replace('\t\t<subject>Einladung</subject>\n\t\t<message><![CDATA[<p>', '\t\t<message><![CDATA[<p>'),
  },
];

/** A text written with LF and one tab per level, in the layout of a file. */
function inLayout(text: string, style: TextStyle): string {
  const lines = text
    .slice(0, -1)
    .split('\n')
    .map((line) => {
      const content = line.replace(/^\t*/, '');
      return style.indent.repeat(line.length - content.length) + content;
    });
  return lines.join(style.eol) + (style.finalNewline ? style.eol : '');
}

describe.each(GOLDEN_FILES)('golden file %s', (name) => {
  const bytes = readFileSync(join(__dirname, '..', '..', '..', 'fixtures', 'golden', 'mail', name));
  const decoded = mailAdapter.decode(bytes);
  const style = detectStyle(decoded.text);

  it('holds the original in its own layout', () => {
    expect(decoded.text).toBe(inLayout(ORIGINAL, style));
  });

  it.each(CASES)('$name', ({ ops, expected }) => {
    const written = mailAdapter.encode(mailAdapter.applyOps(decoded, ops));
    expect(Buffer.from(written).toString('utf8')).toBe(inLayout(expected, style));
  });
});
