import type { DecodedText } from './decode';

const BYTE_ORDER_MARK = [0xef, 0xbb, 0xbf];
const utf8 = new TextEncoder();

/**
 * Encodes text the way it was read by {@link decodeText}: UTF-8 or ISO-8859-1, with the byte order mark it had.
 * Characters that ISO-8859-1 cannot hold throw a `RangeError`; formats with an escape syntax replace them first.
 */
export function encodeText(doc: DecodedText): Uint8Array {
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
      throw new RangeError(`"${text[index]}" cannot be written in ISO-8859-1.`);
    }
    bytes[index] = code;
  }
  return bytes;
}
