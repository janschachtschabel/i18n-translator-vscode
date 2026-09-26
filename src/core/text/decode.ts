export interface DecodedText {
  /** File content without byte order mark. */
  text: string;
  /** `latin-1` means: not valid UTF-8, decoded as ISO-8859-1 (Java's fallback for .properties). */
  encoding: 'utf-8' | 'latin-1';
  bom: boolean;
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Decodes file bytes as UTF-8 and falls back to ISO-8859-1, the way Java's PropertyResourceBundle reads files. */
export function decodeText(bytes: Uint8Array): DecodedText {
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = bom ? bytes.subarray(3) : bytes;
  try {
    return { text: utf8.decode(body), encoding: 'utf-8', bom };
  } catch {
    // Not valid UTF-8: the encoding field tells callers that the fallback was used.
    return { text: decodeLatin1(body), encoding: 'latin-1', bom };
  }
}

/** Exact ISO-8859-1: every byte becomes the code point of the same value (TextDecoder('latin1') is windows-1252). */
function decodeLatin1(bytes: Uint8Array): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return text;
}
