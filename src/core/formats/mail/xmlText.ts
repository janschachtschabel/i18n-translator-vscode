import type { TextStyle } from '../../text/style';
import type { MailField } from './mailRead';
import { firstInvalidCharacter } from './xmlTokens';

/** What new text must look like in the file: its line breaks, its indentation, and whether it is ISO-8859-1. */
export interface Writer {
  style: TextStyle;
  latin1: boolean;
}

/** A subject is escaped text, a message a CDATA section, as edu-sharing's files write them. */
export function fieldBody(field: MailField, value: string, writer: Writer): string {
  const text = prepared(value);
  return field === 'subject' ? escapeText(text, writer) : cdata(text, writer);
}

/** A message inside a CDATA section that the file already has: its start and end stay where they are. */
export function cdataInner(value: string, writer: Writer): string {
  let result = '';
  let previous: 'text' | 'reference' | undefined;
  for (const part of cdataParts(prepared(value), writer)) {
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

export function escapeAttribute(value: string, writer: Writer): string {
  assertXmlText(value);
  const escaped = value.replace(/[&<"]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&quot;',
  );
  return references(escaped, writer);
}

/**
 * The text as it can stand in the file and be read back unchanged: line breaks as XML reads them (line feeds),
 * without the white space at either end that holds a line break, which the reader takes for layout. Planning
 * refuses characters XML cannot hold; this is the last line of defense.
 */
function prepared(value: string): string {
  assertXmlText(value);
  const text = value.replace(/\r\n?/g, '\n');
  const blank = (index: number) => ' \t\n'.includes(text[index]!);
  let lead = 0;
  while (lead < text.length && blank(lead)) {
    lead++;
  }
  if (!text.slice(0, lead).includes('\n')) {
    lead = 0;
  }
  let trail = text.length;
  while (trail > lead && blank(trail - 1)) {
    trail--;
  }
  if (!text.slice(trail).includes('\n')) {
    trail = text.length;
  }
  return text.slice(lead, trail);
}

function assertXmlText(value: string): void {
  const invalid = firstInvalidCharacter(value);
  if (invalid !== -1) {
    throw new RangeError(`XML cannot hold the character at offset ${invalid} of the text.`);
  }
}

function escapeText(text: string, writer: Writer): string {
  const escaped = text.replace(/[&<>]/g, (char) => (char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'));
  return lineBreaks(references(escaped, writer), writer);
}

/** A part of a message: text for a CDATA section, or a character reference between two. */
type Part = { text: string } | { reference: string };

/**
 * A message in parts: `]]>` never stands in one section (`]]` ends one, `>` starts the next), and in ISO-8859-1 a
 * character the file cannot hold follows as a reference between two sections, since CDATA knows no references.
 */
function cdataParts(text: string, writer: Writer): Part[] {
  const parts: Part[] = [];
  const pieces = text.split(']]>');
  pieces.forEach((piece, index) => {
    const section = (index > 0 ? '>' : '') + piece + (index < pieces.length - 1 ? ']]' : '');
    let run = '';
    for (const char of section) {
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
function cdata(text: string, writer: Writer): string {
  return cdataParts(text, writer)
    .map((part) =>
      'reference' in part
        ? part.reference
        : part.text === ''
          ? ''
          : `<![CDATA[${lineBreaks(part.text, writer)}]]>`,
    )
    .join('');
}

/** In ISO-8859-1, the characters the file cannot hold as references. */
function references(text: string, writer: Writer): string {
  if (!writer.latin1) {
    return text;
  }
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    result += code > 0xff ? `&#x${code.toString(16)};` : char;
  }
  return result;
}

/** XML reads every line break as a line feed; the file keeps its own. */
function lineBreaks(text: string, writer: Writer): string {
  return writer.style.eol === '\n' ? text : text.replace(/\n/g, writer.style.eol);
}
