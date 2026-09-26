import { describe, expect, it } from 'vitest';
import { EditError, type FileOp } from '../../../../src/core/formats/adapter';
import { mailAdapter } from '../../../../src/core/formats/mail/mail';
import { keyFromSegments } from '../../../../src/core/model/keys';
import { VALUE_FIELD } from '../../../../src/core/model/types';

const key = (...segments: string[]) => keyFromSegments(segments);
const doc = (text: string, encoding: 'utf-8' | 'latin-1' = 'utf-8') => ({ text, encoding, bom: false });
const apply = (text: string, ...ops: FileOp[]) => mailAdapter.applyOps(doc(text), ops).text;
const valueOf = (text: string, ...segments: string[]) =>
  mailAdapter.parse(doc(text)).entries.find((entry) => entry.key.id === key(...segments).id)?.fields[
    VALUE_FIELD
  ]?.value;
const one = (template: string) => `<templates>\n\t${template}\n</templates>\n`;

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

describe('mailAdapter.applyOps: set', () => {
  it('escapes a subject and puts a message into a CDATA section, so that both read back unchanged', () => {
    const text = one('<template name="t"><subject>S</subject><message>M</message></template>');
    const written = apply(
      text,
      { kind: 'set', key: key('t', 'subject'), value: 'A & B <c> ]]>' },
      { kind: 'set', key: key('t', 'message'), value: '<p>x ]]> y</p>' },
    );
    expect(written).toBe(
      one(
        '<template name="t"><subject>A &amp; B &lt;c&gt; ]]&gt;</subject>' +
          '<message><![CDATA[<p>x ]]]]><![CDATA[> y</p>]]></message></template>',
      ),
    );
    expect(valueOf(written, 't', 'subject')).toBe('A & B <c> ]]>');
    expect(valueOf(written, 't', 'message')).toBe('<p>x ]]> y</p>');
  });

  it('keeps the layout of a CDATA section when the text has to be split, and reads the text back', () => {
    const text = one(
      '<template name="t">\n\t\t<message><![CDATA[\n\t\t\tM\n\t\t]]></message>\n\t</template>',
    );
    const written = apply(text, { kind: 'set', key: key('t', 'message'), value: 'a ]]> b' });
    expect(written).toBe(text.replace('\t\t\tM\n', '\t\t\ta ]]]]><![CDATA[> b\n'));
    expect(valueOf(written, 't', 'message')).toBe('a ]]> b');
  });

  it('writes line breaks at the ends of a text as layout, which they are when read', () => {
    const text = one('<template name="t"><subject>S</subject><message>M</message></template>');
    const written = apply(
      text,
      { kind: 'set', key: key('t', 'subject'), value: '\nHallo' },
      { kind: 'set', key: key('t', 'message'), value: '<p>x</p>\n  ' },
    );
    expect(valueOf(written, 't', 'subject')).toBe('Hallo');
    expect(valueOf(written, 't', 'message')).toBe('<p>x</p>');
    expect(written).toContain('<subject>Hallo</subject><message><![CDATA[<p>x</p>]]></message>');
  });

  it('writes a carriage return in a text as the line break of the file', () => {
    const crlf = '<templates>\r\n\t<template name="t"><message>M</message></template>\r\n</templates>\r\n';
    const written = apply(crlf, {
      kind: 'set',
      key: key('t', 'message'),
      value: 'Zeile 1\r\nZeile 2\rZeile 3',
    });
    expect(written).toContain('<![CDATA[Zeile 1\r\nZeile 2\r\nZeile 3]]>');
    expect(valueOf(written, 't', 'message')).toBe('Zeile 1\nZeile 2\nZeile 3');
  });

  it('refuses to write a character XML cannot hold, as the last line of defense behind planning', () => {
    const text = one('<template name="t"><subject>S</subject></template>');
    const value = `a${String.fromCharCode(11)}b`;
    expect(() => apply(text, { kind: 'set', key: key('t', 'subject'), value })).toThrow(RangeError);
    expect(mailAdapter.invalidText?.(value)).toBe(true);
    expect(mailAdapter.invalidText?.('a\tb\nc')).toBe(false);
  });

  it('fills an empty element', () => {
    expect(
      apply(one('<template name="t"><subject/></template>'), {
        kind: 'set',
        key: key('t', 'subject'),
        value: 'S',
      }),
    ).toBe(one('<template name="t"><subject>S</subject></template>'));
  });

  it('reads line breaks as XML does and writes them as the file does', () => {
    const crlf =
      '<templates>\r\n\t<template name="t">\r\n\t\t<message><![CDATA[a\r\nb]]></message>\r\n\t</template>\r\n</templates>\r\n';
    expect(valueOf(crlf, 't', 'message')).toBe('a\nb');
    const written = apply(crlf, { kind: 'set', key: key('t', 'message'), value: 'x\ny' });
    expect(written).toBe(crlf.replace('a\r\nb', 'x\r\ny'));
  });

  it('refuses a field that holds elements, and fields or templates the file does not have', () => {
    const text = one('<template name="t"><subject>A <b>B</b></subject></template>');
    expect(editError(() => apply(text, { kind: 'set', key: key('t', 'subject'), value: 'x' })).code).toBe(
      'path-conflict',
    );
    expect(editError(() => apply(text, { kind: 'set', key: key('t', 'message'), value: 'x' })).code).toBe(
      'missing-key',
    );
    expect(editError(() => apply(text, { kind: 'set', key: key('u', 'subject'), value: 'x' })).code).toBe(
      'missing-key',
    );
  });
});

describe('mailAdapter.applyOps: insert', () => {
  it('opens an empty template and an empty file of templates', () => {
    expect(apply(one('<template name="t"/>'), { kind: 'insert', key: key('t', 'subject'), value: 'S' })).toBe(
      one('<template name="t">\n\t\t<subject>S</subject>\n\t</template>'),
    );
    expect(apply('<templates/>\n', { kind: 'insert', key: key('t', 'subject'), value: 'S' })).toBe(
      '<templates>\n  <template name="t">\n    <subject>S</subject>\n  </template>\n</templates>\n',
    );
    expect(
      apply('<templates>\n</templates>\n', { kind: 'insert', key: key('t', 'subject'), value: 'S' }),
    ).toBe('<templates>\n  <template name="t">\n    <subject>S</subject>\n  </template>\n</templates>\n');
  });

  it('writes a template of a context with both attributes, escaped', () => {
    const written = apply('<templates>\n</templates>\n', {
      kind: 'insert',
      key: key('a&b@school', 'subject'),
      value: 'S',
    });
    expect(written).toContain('<template name="a&amp;b" context="school">');
    expect(valueOf(written, 'a&b@school', 'subject')).toBe('S');
  });

  it('refuses a field the template already has', () => {
    expect(
      editError(() =>
        apply(one('<template name="t"><subject>S</subject></template>'), {
          kind: 'insert',
          key: key('t', 'subject'),
          value: 'x',
        }),
      ).code,
    ).toBe('key-exists');
  });
});

describe('mailAdapter.applyOps: delete and rename', () => {
  it('keeps a template that still has other elements, such as a style sheet', () => {
    const text = one('<template name="t"><style>s</style><subject>S</subject></template>');
    expect(apply(text, { kind: 'delete', key: key('t', 'subject') })).toBe(
      one('<template name="t"><style>s</style></template>'),
    );
  });

  it('removes every repetition of a field, and hidden repetitions when it is renamed', () => {
    const text = one('<template name="t"><subject>A</subject><subject>B</subject></template>');
    expect(apply(text, { kind: 'delete', key: key('t', 'subject') })).toBe('<templates>\n</templates>\n');
    expect(apply(text, { kind: 'rename', from: key('t', 'subject'), to: key('t', 'message') })).toBe(
      one('<template name="t"><message>A</message></template>'),
    );
  });

  it('keeps a template that hides an earlier one of the same name, so that the earlier one does not come back', () => {
    const text =
      '<templates>\n\t<template name="t"><subject>OLD</subject></template>\n' +
      '\t<template name="t"><subject>NEW</subject></template>\n</templates>\n';
    const deleted = apply(text, { kind: 'delete', key: key('t', 'subject') });
    expect(deleted).toBe(text.replace('<subject>NEW</subject>', ''));
    expect(valueOf(deleted, 't', 'subject')).toBeUndefined();
    const moved = apply(text, { kind: 'rename', from: key('t', 'subject'), to: key('u', 'subject') });
    expect(valueOf(moved, 't', 'subject')).toBeUndefined();
    expect(valueOf(moved, 'u', 'subject')).toBe('NEW');
  });

  it('puts a new field after a comment that ends the line of its sibling', () => {
    const text = one('<template name="t">\n\t\t<subject>S</subject> <!-- note -->\n\t</template>');
    expect(
      apply(text, { kind: 'insert', key: key('t', 'message'), value: 'M', after: key('t', 'subject') }),
    ).toBe(text.replace('<!-- note -->\n', '<!-- note -->\n\t\t<message><![CDATA[M]]></message>\n'));
  });

  it('indents a new template like the template it follows', () => {
    const text =
      '<templates>\n\t<template name="a">\n\t\t<subject>A</subject>\n\t</template>\n' +
      '  <template name="b">\n    <subject>B</subject>\n  </template>\n</templates>\n';
    expect(apply(text, { kind: 'insert', key: key('c', 'subject'), value: 'C', after: key('b') })).toBe(
      text.replace(
        '  </template>\n</templates>',
        '  </template>\n  <template name="c">\n    <subject>C</subject>\n  </template>\n</templates>',
      ),
    );
  });

  it('refuses to rename onto a field that exists or from one that does not', () => {
    const text = one('<template name="t"><subject>S</subject><message>M</message></template>');
    expect(
      editError(() => apply(text, { kind: 'rename', from: key('t', 'subject'), to: key('t', 'message') }))
        .code,
    ).toBe('key-exists');
    expect(editError(() => apply(text, { kind: 'delete', key: key('u', 'subject') })).code).toBe(
      'missing-key',
    );
  });

  it('refuses to change a file with a syntax error', () => {
    expect(editError(() => apply('<templates>', { kind: 'delete', key: key('t', 'subject') })).code).toBe(
      'unparsable',
    );
  });
});

describe('mailAdapter: encoding and new files', () => {
  it('writes characters beyond ISO-8859-1 as references, outside CDATA sections', () => {
    const text = one('<template name="t"><subject>S</subject><message>M</message></template>');
    const written = mailAdapter.applyOps(doc(text, 'latin-1'), [
      { kind: 'set', key: key('t', 'subject'), value: 'ä €' },
      { kind: 'set', key: key('t', 'message'), value: '5 €' },
    ]);
    expect(written.text).toContain('<subject>ä &#x20ac;</subject>');
    expect(written.text).toContain('<message><![CDATA[5 ]]>&#x20ac;</message>');
    expect(Buffer.from(mailAdapter.encode(written)).toString('latin1')).toBe(written.text);
    expect(valueOf(written.text, 't', 'message')).toBe('5 €');
  });

  it('follows an encoding the XML declaration names, as Java does', () => {
    const latin1 =
      '<?xml version="1.0" encoding="ISO-8859-1"?>\n<templates><template name="t"><subject>S</subject></template></templates>\n';
    const decoded = mailAdapter.decode(Buffer.from(latin1, 'latin1'));
    expect(decoded.encoding).toBe('latin-1');
    expect(mailAdapter.parse(decoded).problems).toEqual([]);
    const written = mailAdapter.encode(
      mailAdapter.applyOps(decoded, [{ kind: 'set', key: key('t', 'subject'), value: 'Grüße €' }]),
    );
    expect(Buffer.from(written).toString('latin1')).toBe(
      latin1.replace('<subject>S', '<subject>Grüße &#x20ac;'),
    );
  });

  it('reads no file whose declaration names an encoding it cannot keep', () => {
    const text = '<?xml version="1.0" encoding="windows-1252"?><templates/>';
    const parsed = mailAdapter.parse(mailAdapter.decode(Buffer.from(text, 'latin1')));
    expect(
      parsed.problems.map((problem) => [problem.code, problem.detail, text.slice(...problem.range)]),
    ).toEqual([['parse-error', 'UnsupportedEncoding', 'windows-1252']]);
  });

  it('reports a file that is not UTF-8, which Java reads as UTF-8 without a declaration', () => {
    expect(mailAdapter.parse(doc('<templates/>', 'latin-1')).problems.map((problem) => problem.code)).toEqual(
      ['not-utf8'],
    );
  });

  it('starts a new file with an empty list of templates in the layout it is given', () => {
    expect(mailAdapter.createEmpty()).toBe('<templates>\n</templates>\n');
    expect(mailAdapter.createEmpty({ eol: '\r\n', indent: '\t', finalNewline: false })).toBe(
      '<templates>\r\n</templates>',
    );
  });
});
