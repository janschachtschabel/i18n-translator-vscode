import type { Bundle } from '../../model/bundle';
import { keyFromSegments } from '../../model/keys';
import { BASE_FILE_LOCALE } from '../../model/locale';
import type { LocaleCode } from '../../model/types';
import type { FileProblem } from '../adapter';
import { MAIL_FIELDS, readMail, splitTemplateId, type MailField } from './mailRead';
import type { XmlElement } from './xmlTokens';

/** A text of a template and the file it comes from: the language's own, or the base file. */
export interface MailText {
  text: string;
  locale: LocaleCode;
}

export interface ComposedMail {
  subject: MailText | undefined;
  /** The template's own message; `html` holds it with the parts around it. */
  message: MailText | undefined;
  header: MailText | undefined;
  footer: MailText | undefined;
  /** The HTML body edu-sharing sends. */
  html: string;
}

/** The mail of a template in one language, or the file that keeps edu-sharing from sending it. */
export type LanguageMail =
  | { locale: LocaleCode; mail: ComposedMail }
  | { locale: LocaleCode; unreadable: { locale: LocaleCode; problem: FileProblem } };

/**
 * The mail of a template in every language of the bundle, in its order (the reference first). For every mail,
 * edu-sharing parses the language's file and the base file and lets an error through (`MailTemplate.getTemplates`):
 * where one of them does not parse, or its bytes are no UTF-8 without a declaration saying otherwise, no mail goes
 * out in that language; where the base file does not, none goes out at all.
 */
export function composeMails(bundle: Bundle, templateId: string): LanguageMail[] {
  const brokenBase = unreadable(bundle, BASE_FILE_LOCALE);
  const style = styleSheetOf(bundle, templateId);
  return bundle.locales.map((locale) => {
    const broken = brokenBase ?? unreadable(bundle, locale);
    return broken
      ? { locale, unreadable: broken }
      : { locale, mail: composeMail(bundle, templateId, locale, style) };
  });
}

/**
 * The mail of a template in a language, put together like `MailTemplate.getContent` of edu-sharing: the style
 * sheet of the template `stylesheet` in the base file, the `header`, the message in `<div class='content'>` and the
 * `footer` in `<div class='footer'>`. What no file has is left out, where edu-sharing would write "null".
 *
 * simplify: a template of the context with neither subject nor message (only a style) counts as missing: entries
 * hold only these fields.
 */
export function composeMail(
  bundle: Bundle,
  templateId: string,
  locale: LocaleCode,
  style: string = styleSheetOf(bundle, templateId),
): ComposedMail {
  const { name, context } = splitTemplateId(templateId);
  const find = (template: string, field: MailField) => lookUp(bundle, locale, template, context, field);
  const message = find(name, 'message');
  const header = find('header', 'message');
  const footer = find('footer', 'message');
  return {
    subject: find(name, 'subject'),
    message,
    header,
    footer,
    html:
      `<style>${style}</style>${header?.text ?? ''}` +
      `<div class='content'>${message?.text ?? ''}</div><div class='footer'>${footer?.text ?? ''}</div>`,
  };
}

/** A problem that keeps Java from reading the file of a language, if it has one. */
function unreadable(
  bundle: Bundle,
  locale: LocaleCode,
): { locale: LocaleCode; problem: FileProblem } | undefined {
  const problem = bundle
    .file(locale)
    ?.parsed.problems.find((candidate) => candidate.code === 'parse-error' || candidate.code === 'not-utf8');
  return problem && { locale, problem };
}

/**
 * Where edu-sharing looks: in the language's file, then in the base file. In a file, the template of the context
 * comes first if the file has it, even without the field; the one without context only if it does not.
 */
function lookUp(
  bundle: Bundle,
  locale: LocaleCode,
  name: string,
  context: string | undefined,
  field: MailField,
): MailText | undefined {
  for (const file of [locale, BASE_FILE_LOCALE]) {
    const withContext = context === undefined ? undefined : `${name}@${context}`;
    const id = withContext !== undefined && hasTemplate(bundle, withContext, file) ? withContext : name;
    const text = bundle.value(keyFromSegments([id, field]).id, file);
    if (text !== undefined) {
      return { text, locale: file };
    }
  }
  return undefined;
}

function hasTemplate(bundle: Bundle, id: string, locale: LocaleCode): boolean {
  return MAIL_FIELDS.some((field) => bundle.value(keyFromSegments([id, field]).id, locale) !== undefined);
}

/** The style sheet of the base file for the template's context; empty if it has none. */
function styleSheetOf(bundle: Bundle, templateId: string): string {
  return styleSheet(bundle.file(BASE_FILE_LOCALE)?.doc.text, splitTemplateId(templateId).context) ?? '';
}

/**
 * The text of the `style` element of the template `stylesheet` in the base file, which no entry holds: that of the
 * context, if the file has one, else the one without; a later template of the same id replaces an earlier one.
 */
function styleSheet(text: string | undefined, context: string | undefined): string | undefined {
  const read = text === undefined ? undefined : readMail(text);
  if (!read?.ok) {
    return undefined;
  }
  const ids = context === undefined ? ['stylesheet'] : [`stylesheet@${context}`, 'stylesheet'];
  for (const id of ids) {
    const template = read.templates.filter((candidate) => candidate.id === id).pop();
    if (template) {
      const style = template.element.children.find(
        (child): child is XmlElement => child.kind === 'element' && child.name === 'style',
      );
      return style && textContent(text!, style);
    }
  }
  return undefined;
}

/** As the DOM's `textContent`: the text of every descendant, CDATA included, comments left out. */
function textContent(text: string, element: XmlElement): string {
  return element.children
    .map((child) => {
      switch (child.kind) {
        case 'text':
          return child.value;
        case 'cdata':
          return text.slice(...child.inner);
        case 'element':
          return textContent(text, child);
        default:
          return '';
      }
    })
    .join('')
    .replace(/\r\n?/g, '\n');
}
