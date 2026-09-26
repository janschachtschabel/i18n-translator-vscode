import type { Bundle } from '../../model/bundle';
import { keyFromSegments } from '../../model/keys';
import { BASE_FILE_LOCALE } from '../../model/locale';
import type { LocaleCode } from '../../model/types';
import { readMail, splitTemplateId, type MailField } from './mailRead';
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
  /** The HTML body edu-sharing sends. */
  html: string;
}

/**
 * The mail of a template in a language, put together like `MailTemplate.getContent` of edu-sharing: the style
 * sheet of the template `stylesheet` in the base file, the `header`, the message in `<div class='content'>` and the
 * `footer` in `<div class='footer'>`. What no file has is left out, where edu-sharing would write "null".
 *
 * simplify: edu-sharing does not fall back to the template without context within one file when the template of
 * the context is there but lacks the field; entries cannot tell such an empty template from a missing one.
 */
export function composeMail(bundle: Bundle, templateId: string, locale: LocaleCode): ComposedMail {
  const { name, context } = splitTemplateId(templateId);
  const find = (template: string, field: MailField) => lookUp(bundle, locale, template, context, field);
  const message = find(name, 'message');
  const header = find('header', 'message')?.text ?? '';
  const footer = find('footer', 'message')?.text ?? '';
  const style = styleSheet(bundle.file(BASE_FILE_LOCALE)?.doc.text, context) ?? '';
  return {
    subject: find(name, 'subject'),
    message,
    html:
      `<style>${style}</style>${header}` +
      `<div class='content'>${message?.text ?? ''}</div><div class='footer'>${footer}</div>`,
  };
}

/** Where edu-sharing looks: in the language's file, then in the base file; in each, the template of the context first. */
function lookUp(
  bundle: Bundle,
  locale: LocaleCode,
  name: string,
  context: string | undefined,
  field: MailField,
): MailText | undefined {
  const ids = context === undefined ? [name] : [`${name}@${context}`, name];
  for (const file of [locale, BASE_FILE_LOCALE]) {
    for (const id of ids) {
      const text = bundle.value(keyFromSegments([id, field]).id, file);
      if (text !== undefined) {
        return { text, locale: file };
      }
    }
  }
  return undefined;
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
