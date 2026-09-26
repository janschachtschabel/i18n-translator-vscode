import type { DecodedText } from './decode';

const BYTE_ORDER_MARK = [0xef, 0xbb, 0xbf];
const utf8 = new TextEncoder();

/**
 * Encodes text the way `decodeText` read it: UTF-8 or ISO-8859-1, with the byte order mark it had. Nothing is
 * replaced silently: an incomplete character (a lone surrogate) and, in ISO-8859-1, any character above U+00FF
 * throw a `RangeError`. Formats with an escape syntax replace such characters first.
 */
export function encodeText(doc: DecodedText): Uint8Array {
  // TextEncoder would turn a lone surrogate into U+FFFD.
  const incomplete = /\p{Cs}/u.exec(doc.text);
  if (incomplete) {
    throw new RangeError(`The text has an incomplete character at offset ${incomplete.index}.`);
  }
  const body = doc.encoding === 'utf-8' ? utf8.encode(doc.text) : latin1(doc.text);
  if (!doc.bom) {
    return body;
  }
  const bytes = new Uint8Array(BYTE_ORDER_MARK.length + body.length);
  bytes.set(BYTE_ORDER_MARK);
  bytes.set(body, BYTE_ORDER_MARK.length);
  return bytes;
}

function latin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code > 0xff) {
      throw new RangeError(
        `"${String.fromCodePoint(text.codePointAt(index)!)}" cannot be written in ISO-8859-1.`,
      );
    }
    bytes[index] = code;
  }
  return bytes;
}
