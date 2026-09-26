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
