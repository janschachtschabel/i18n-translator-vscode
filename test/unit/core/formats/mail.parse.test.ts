import { describe, expect, it } from 'vitest';
import { parseMail } from '../../../../src/core/formats/mail/mailRead';
import { VALUE_FIELD } from '../../../../src/core/model/types';

const summary = (text: string) =>
  parseMail(text).entries.map((entry) => [entry.key.segments, entry.fields[VALUE_FIELD]?.value]);
const problems = (text: string) =>
  parseMail(text).problems.map((problem) => [problem.code, problem.detail ?? problem.key?.segments]);

const MAIL = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Mail templates -->
<templates>
\t<template name="invited">
\t\t<subject>Einladung &amp; mehr &#228;</subject>
\t\t<message><![CDATA[
\t\t\t<p>Hallo {{name}}</p>
\t\t]]>
\t\t</message>
\t</template>
\t<!-- between -->
\t<template name='header'>
\t\t<message><![CDATA[<div>Kopf</div>]]></message>
\t</template>
</templates>
`;

describe('parseMail', () => {
  it('reads subject and message of every template as entries, in file order', () => {
    expect(summary(MAIL)).toEqual([
      [['invited', 'subject'], 'Einladung & mehr ä'],
      [['invited', 'message'], '<p>Hallo {{name}}</p>'],
      [['header', 'message'], '<div>Kopf</div>'],
    ]);
    expect(parseMail(MAIL).problems).toEqual([]);
    expect(parseMail(MAIL).topLevelKeys).toEqual(['invited', 'header']);
  });

  it('leaves out the layout: line breaks and indentation around the text and inside a lone CDATA section', () => {
    const field = parseMail(MAIL).entries[1]!.fields[VALUE_FIELD]!;
    expect(MAIL.slice(...field.valueRange)).toBe('<p>Hallo {{name}}</p>');
    expect(
      summary('<templates><template name="t"><subject>\n  Hallo\n</subject></template></templates>'),
    ).toEqual([[['t', 'subject'], 'Hallo']]);
  });

  it('keeps white space within one line, which a subject may mean', () => {
    expect(
      summary('<templates><template name="t"><subject> Hallo </subject></template></templates>'),
    ).toEqual([[['t', 'subject'], ' Hallo ']]);
  });

  it('joins text and CDATA sections like getTextContent when there is more than one CDATA section', () => {
    expect(
      summary(
        '<templates><template name="t"><message>a<![CDATA[<b>]]>b<![CDATA[</b>]]></message></template></templates>',
      ),
    ).toEqual([[['t', 'message'], 'a<b>b</b>']]);
  });

  it('reads empty fields as empty texts', () => {
    expect(
      summary('<templates><template name="t"><subject/><message></message></template></templates>'),
    ).toEqual([
      [['t', 'subject'], ''],
      [['t', 'message'], ''],
    ]);
  });

  it('ignores other elements of a template, such as the style sheet, and templates without fields', () => {
    expect(
      summary(
        '<templates><template name="stylesheet"><style><![CDATA[body{}]]></style></template>' +
          '<template name="t"><style/><subject>S</subject></template></templates>',
      ),
    ).toEqual([[['t', 'subject'], 'S']]);
  });

  it('names a template for a context "name@context"', () => {
    expect(
      summary('<templates><template name="t" context="school"><subject>S</subject></template></templates>'),
    ).toEqual([[['t@school', 'subject'], 'S']]);
  });

  it('lets the last of two templates of the same name win, as edu-sharing does, and reports it', () => {
    const text =
      '<templates><template name="t"><subject>A</subject><message>M</message></template>' +
      '<template name="u"><subject>U</subject></template>' +
      '<template name="t"><subject>B</subject></template></templates>';
    expect(summary(text)).toEqual([
      [['t', 'subject'], 'B'],
      [['u', 'subject'], 'U'],
    ]);
    expect(problems(text)).toEqual([['duplicate-key', ['t']]]);
  });

  it('takes the first of two fields of the same name, as MailTemplate does, and reports the second', () => {
    const text =
      '<templates><template name="t"><subject>A</subject><subject>B</subject></template></templates>';
    expect(summary(text)).toEqual([[['t', 'subject'], 'A']]);
    expect(problems(text)).toEqual([['duplicate-key', ['t', 'subject']]]);
  });

  it('reports a field with elements or comments inside as no text', () => {
    const text =
      '<templates><template name="t"><subject>A <b>B</b></subject><message>x<!-- c --></message></template></templates>';
    expect(summary(text)).toEqual([]);
    expect(problems(text)).toEqual([
      ['non-string-value', ['t', 'subject']],
      ['non-string-value', ['t', 'message']],
    ]);
  });

  it('reports broken XML as a syntax error without entries', () => {
    for (const [text, detail] of [
      ['<templates><template name="t"><subject>A</template></templates>', 'MismatchedEndTag'],
      ['<templates><template name="t"><subject>A', 'UnclosedElement'],
      ['<templates><template name="t"><subject>A & B</subject></template></templates>', 'InvalidEntity'],
      ['<templates><template name="t"><subject>&nbsp;</subject></template></templates>', 'UnknownEntity'],
      ['<templates><template name="t" name="u"/></templates>', 'DuplicateAttribute'],
      ['<?xml version="1.0"?><!DOCTYPE templates><templates/>', 'DoctypeNotSupported'],
      ['<templates/><templates/>', 'ContentAfterRoot'],
      ['<mails><template name="t"/></mails>', 'RootNotTemplates'],
    ]) {
      const parsed = parseMail(text!);
      expect(parsed.entries, text).toEqual([]);
      expect(
        parsed.problems.map((problem) => [problem.code, problem.detail]),
        text,
      ).toEqual([['parse-error', detail]]);
    }
  });

  it('points a syntax error at its place', () => {
    const text = '<templates><template name="t"><subject>A</template></templates>';
    expect(parseMail(text).problems[0]?.range).toEqual([40, 50]);
  });

  it('reads an empty file of templates', () => {
    expect(parseMail('<templates>\n</templates>\n')).toEqual({ entries: [], problems: [], topLevelKeys: [] });
  });
});
