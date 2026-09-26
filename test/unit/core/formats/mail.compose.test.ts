import { describe, expect, it } from 'vitest';
import { MAIL_PRESET } from '../../../../src/core/area/presets';
import { mailAdapter } from '../../../../src/core/formats/mail/mail';
import { composeMail, composeMails, type LanguageMail } from '../../../../src/core/formats/mail/mailCompose';
import { buildBundle } from '../../../../src/core/model/bundle';

/** The mail templates of `{ locale: xml }`; `default` is templates.xml. Bytes go through the decoder. */
function mailBundle(files: Record<string, string | Uint8Array>) {
  return buildBundle(
    MAIL_PRESET,
    'mail',
    'templates',
    Object.entries(files).map(([locale, content]) => {
      const doc =
        typeof content === 'string'
          ? { text: content, encoding: 'utf-8' as const, bom: false }
          : mailAdapter.decode(content);
      const relPath = `mail/templates${locale === 'default' ? '' : `_${locale}`}.xml`;
      return { locale, relPath, doc, parsed: mailAdapter.parse(doc) };
    }),
    { referenceLanguage: 'de', baseFileLanguage: 'en' },
  );
}

const templates = (...all: string[]) => `<templates>\n${all.join('\n')}\n</templates>\n`;

const BASE = templates(
  '<template name="header"><message><![CDATA[<div class="logo">H</div>]]></message></template>',
  '<template name="stylesheet"><style><![CDATA[.content{max-width:500px}]]></style></template>',
  '<template name="invited"><subject>Invitation</subject><message><![CDATA[<p>Hello {{name}}</p>]]></message></template>',
  '<template name="footer"><message>F</message></template>',
);

describe('composeMail', () => {
  it('puts the mail together as edu-sharing does: style sheet, header, message and footer', () => {
    expect(composeMail(mailBundle({ default: BASE }), 'invited', 'default')).toEqual({
      subject: { text: 'Invitation', locale: 'default' },
      message: { text: '<p>Hello {{name}}</p>', locale: 'default' },
      header: { text: '<div class="logo">H</div>', locale: 'default' },
      footer: { text: 'F', locale: 'default' },
      html:
        '<style>.content{max-width:500px}</style><div class="logo">H</div>' +
        "<div class='content'><p>Hello {{name}}</p></div><div class='footer'>F</div>",
    });
  });

  it('takes each part a language lacks from the base file, and names the file of each text', () => {
    const bundle = mailBundle({
      default: BASE,
      de_DE: templates(
        '<template name="header"><message>K</message></template>',
        '<template name="invited"><message>Hallo</message></template>',
      ),
    });
    expect(composeMail(bundle, 'invited', 'de_DE')).toEqual({
      subject: { text: 'Invitation', locale: 'default' },
      message: { text: 'Hallo', locale: 'de_DE' },
      header: { text: 'K', locale: 'de_DE' },
      footer: { text: 'F', locale: 'default' },
      html: "<style>.content{max-width:500px}</style>K<div class='content'>Hallo</div><div class='footer'>F</div>",
    });
  });

  it('takes the template of the context where there is one, else the one without', () => {
    const bundle = mailBundle({
      default: templates(
        '<template name="header"><message>H</message></template>',
        '<template name="header" context="school"><message>HS</message></template>',
        '<template name="invited"><subject>S</subject><message>M</message></template>',
        '<template name="footer"><message>F</message></template>',
      ),
    });
    expect(composeMail(bundle, 'invited@school', 'default').html).toBe(
      "<style></style>HS<div class='content'>M</div><div class='footer'>F</div>",
    );
  });

  // MailTemplate.getChildContent: the template of the context wins in a file; lacking the field, it sends the
  // search on to the base file, not to the template without context of the same file.
  it('keeps to the template of the context a file has, even where it lacks the field', () => {
    const bundle = mailBundle({
      default: templates('<template name="invited"><subject>S</subject><message>M</message></template>'),
      fr_FR: templates(
        '<template name="invited"><subject>S fr</subject><message>M fr</message></template>',
        '<template name="invited" context="school"><subject>S école</subject></template>',
      ),
    });
    const mail = composeMail(bundle, 'invited@school', 'fr_FR');
    expect(mail.subject).toEqual({ text: 'S école', locale: 'fr_FR' });
    expect(mail.message).toEqual({ text: 'M', locale: 'default' });
  });

  it('reads the style sheet of the base file only, of the context where it has one, with entities resolved', () => {
    const bundle = mailBundle({
      default: templates(
        '<template name="stylesheet"><style>p &gt; a{color:red}</style></template>',
        '<template name="stylesheet" context="school"><style>b{}</style></template>',
        '<template name="t"><message>M</message></template>',
      ),
      de_DE: templates(
        '<template name="stylesheet"><style>c{}</style></template>',
        '<template name="t"><message>N</message></template>',
      ),
    });
    expect(composeMail(bundle, 't', 'de_DE').html).toBe(
      "<style>p > a{color:red}</style><div class='content'>N</div><div class='footer'></div>",
    );
    expect(composeMail(bundle, 't@school', 'de_DE').html).toContain('<style>b{}</style>');
  });

  it('leaves out what no file has, where edu-sharing would write "null"', () => {
    const bundle = mailBundle({ default: templates('<template name="t"><subject>S</subject></template>') });
    expect(composeMail(bundle, 't', 'fr_FR')).toEqual({
      subject: { text: 'S', locale: 'default' },
      message: undefined,
      header: undefined,
      footer: undefined,
      html: "<style></style><div class='content'></div><div class='footer'></div>",
    });
  });
});

describe('composeMails', () => {
  /** Per language: `mail`, or the language of the file edu-sharing cannot read. */
  const outcome = (mails: LanguageMail[]) =>
    mails.map((entry) => [entry.locale, 'mail' in entry ? 'mail' : `unreadable ${entry.unreadable.locale}`]);

  it('puts the mail together in every language, the reference first', () => {
    const bundle = mailBundle({ default: BASE, fr_FR: templates(), de_DE: templates() });
    expect(outcome(composeMails(bundle, 'invited'))).toEqual([
      ['de_DE', 'mail'],
      ['default', 'mail'],
      ['fr_FR', 'mail'],
    ]);
  });

  // MailTemplate.getTemplates parses the file of the language and the base file for every mail and lets the error
  // through: no mail goes out in that language, and none at all when the base file is broken.
  it('has no mail in a language whose file edu-sharing cannot read, and none when the base file is broken', () => {
    expect(
      outcome(
        composeMails(
          mailBundle({ default: BASE, de_DE: '<templates><template>', fr_FR: templates() }),
          'invited',
        ),
      ),
    ).toEqual([
      ['de_DE', 'unreadable de_DE'],
      ['default', 'mail'],
      ['fr_FR', 'mail'],
    ]);
    expect(
      outcome(composeMails(mailBundle({ default: '<templates>', de_DE: templates() }), 'invited')),
    ).toEqual([
      ['de_DE', 'unreadable default'],
      ['default', 'unreadable default'],
    ]);
  });

  it('counts a file whose bytes are not UTF-8 as unreadable: Java reads it as UTF-8 without a declaration', () => {
    const latin1 = Uint8Array.from(
      templates('<template name="invited"><subject>é</subject></template>'),
      (char) => char.charCodeAt(0),
    );
    const [, , french] = composeMails(
      mailBundle({ default: BASE, de_DE: templates(), fr_FR: latin1 }),
      'invited',
    );
    expect(french).toMatchObject({
      locale: 'fr_FR',
      unreadable: { locale: 'fr_FR', problem: { code: 'not-utf8' } },
    });
  });
});
