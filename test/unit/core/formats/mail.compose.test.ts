import { describe, expect, it } from 'vitest';
import { MAIL_PRESET } from '../../../../src/core/area/presets';
import { mailAdapter } from '../../../../src/core/formats/mail/mail';
import { composeMail } from '../../../../src/core/formats/mail/mailCompose';
import { buildBundle } from '../../../../src/core/model/bundle';

/** The mail templates of `{ locale: xml }`; `default` is templates.xml. */
function mailBundle(files: Record<string, string>) {
  return buildBundle(
    MAIL_PRESET,
    'mail',
    'templates',
    Object.entries(files).map(([locale, text]) => {
      const doc = { text, encoding: 'utf-8' as const, bom: false };
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
      html:
        '<style>.content{max-width:500px}</style><div class="logo">H</div>' +
        "<div class='content'><p>Hello {{name}}</p></div><div class='footer'>F</div>",
    });
  });

  it('takes each part a language lacks from the base file, and names the file of the texts', () => {
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

  it('reads the style sheet of the base file only, with its entities resolved', () => {
    const bundle = mailBundle({
      default: templates(
        '<template name="stylesheet"><style>p &gt; a{color:red}</style></template>',
        '<template name="t"><message>M</message></template>',
      ),
      de_DE: templates(
        '<template name="stylesheet"><style>b{}</style></template>',
        '<template name="t"><message>N</message></template>',
      ),
    });
    expect(composeMail(bundle, 't', 'de_DE').html).toBe(
      "<style>p > a{color:red}</style><div class='content'>N</div><div class='footer'></div>",
    );
  });

  it('leaves out what no file has, where edu-sharing would write "null"', () => {
    const bundle = mailBundle({ default: templates('<template name="t"><subject>S</subject></template>') });
    expect(composeMail(bundle, 't', 'fr_FR')).toEqual({
      subject: { text: 'S', locale: 'default' },
      message: undefined,
      html: "<style></style><div class='content'></div><div class='footer'></div>",
    });
  });
});
