import type { TextStyle } from '../../text/style';
import type { MailField } from './mailRead';

/** What new text must look like in the file: its line breaks, its indentation, and whether it is ISO-8859-1. */
export interface Writer {
  style: TextStyle;
  latin1: boolean;
}

/** A subject is escaped text, a message a CDATA section, as edu-sharing's files write them. */
export function fieldBody(field: MailField, value: string, writer: Writer): string {
  return field === 'subject' ? escapeText(value, writer) : cdata(value, writer);
}

function escapeText(value: string, writer: Writer): string {
  const escaped = value.replace(/[&<>]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;',
  );
  return lineBreaks(
    beyondLatin1(escaped, writer, (reference) => reference),
    writer,
  );
}

export function escapeAttribute(value: string, writer: Writer): string {
  const escaped = value.replace(/[&<"]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&quot;',
  );
  return beyondLatin1(escaped, writer, (reference) => reference);
}

/** A part of a message: text for a CDATA section, or a character reference between two. */
type Part = { text: string } | { reference: string };

/**
 * A message in parts: `]]>` never stands in one section (`]]` ends one, `>` starts the next), and in ISO-8859-1 a
 * character the file cannot hold follows as a reference between two sections, since CDATA knows no references.
 */
function cdataParts(value: string, writer: Writer): Part[] {
  const parts: Part[] = [];
  const pieces = value.split(']]>');
  pieces.forEach((piece, index) => {
    const text = (index > 0 ? '>' : '') + piece + (index < pieces.length - 1 ? ']]' : '');
    let run = '';
    for (const char of text) {
      const code = char.codePointAt(0)!;
      if (writer.latin1 && code > 0xff) {
        parts.push({ text: run }, { reference: `&#x${code.toString(16)};` });
        run = '';
      } else {
        run += char;
      }
    }
    parts.push({ text: run });
  });
  return parts;
}

/** A message as CDATA sections, without empty ones. */
function cdata(value: string, writer: Writer): string {
  return cdataParts(value, writer)
    .map((part) =>
      'reference' in part
        ? part.reference
        : part.text === ''
          ? ''
          : `<![CDATA[${lineBreaks(part.text, writer)}]]>`,
    )
    .join('');
}

/** A message inside a CDATA section that the file already has: its start and end stay where they are. */
export function cdataInner(value: string, writer: Writer): string {
  let result = '';
  let previous: 'text' | 'reference' | undefined;
  for (const part of cdataParts(value, writer)) {
    if ('reference' in part) {
      result += `]]>${part.reference}<![CDATA[`;
      previous = 'reference';
      continue;
    }
    if (previous === 'text') {
      result += ']]><![CDATA[';
    }
    result += lineBreaks(part.text, writer);
    previous = 'text';
  }
  return result;
}

function beyondLatin1(text: string, writer: Writer, wrap: (reference: string) => string): string {
  if (!writer.latin1) {
    return text;
  }
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    result += code > 0xff ? wrap(`&#x${code.toString(16)};`) : char;
  }
  return result;
}

/** XML reads every line break as a line feed; the file keeps its own. */
function lineBreaks(text: string, writer: Writer): string {
  return writer.style.eol === '\n' ? text : text.replace(/\n/g, writer.style.eol);
}
