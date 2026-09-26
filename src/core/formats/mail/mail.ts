import { decodeAsLatin1, decodeText } from '../../text/decode';
import { encodeText } from '../../text/encode';
import { DEFAULT_STYLE } from '../../text/style';
import type { FormatAdapter, TextRange } from '../adapter';
import { MAIL_FIELDS, parseMail } from './mailRead';
import { applyMailOps } from './mailWrite';
import { firstInvalidCharacter } from './xmlTokens';

const LATIN1 = /^(?:iso[-_]?8859[-_]1|iso-ir-100|latin-?1|l1|cp819|ibm819)$/i;
const UTF8 = /^utf-?8$/i;

/**
 * edu-sharing mail templates (`templates[_{locale}].xml`): the subject and the message of each template are the
 * texts, keyed `[template, field]`. The writer already writes characters that an ISO-8859-1 file cannot hold as
 * references, so encoding never has to replace anything.
 */
export const mailAdapter: FormatAdapter = {
  id: 'mail-xml',
  flatKeys: false,
  // A template is a name and at most one context, without "@" or white space (XML turns it into spaces there).
  validKey: (key) =>
    key.segments.length === 2 &&
    /^[^@\s]+(?:@[^@\s]+)?$/.test(key.segments[0]!) &&
    firstInvalidCharacter(key.segments[0]!) === -1 &&
    (MAIL_FIELDS as readonly string[]).includes(key.segments[1]!),
  invalidText: (value) => firstInvalidCharacter(value) !== -1,
  // Java's XML parser reads the encoding the declaration names; the declaration is ASCII in either encoding.
  decode(bytes) {
    const declared = declaredEncoding(decodeAsLatin1(bytes.subarray(0, 256)).text);
    return declared && LATIN1.test(declared.name) ? decodeAsLatin1(bytes) : decodeText(bytes);
  },
  parse(doc) {
    const declared = declaredEncoding(doc.text);
    if (declared && !UTF8.test(declared.name) && !LATIN1.test(declared.name)) {
      // An encoding the file could not keep when written: read nothing, so that nothing is written.
      return {
        entries: [],
        problems: [{ code: 'parse-error', range: declared.range, detail: 'UnsupportedEncoding' }],
        topLevelKeys: [],
      };
    }
    const parsed = parseMail(doc.text);
    // Without a declaration of ISO-8859-1, Java's XML parser reads UTF-8 and fails on the bytes of another encoding.
    return doc.encoding === 'utf-8' || (declared !== undefined && LATIN1.test(declared.name))
      ? parsed
      : { ...parsed, problems: [{ code: 'not-utf8', range: [0, 0] }, ...parsed.problems] };
  },
  applyOps: (doc, ops) => ({ ...doc, text: applyMailOps(doc, ops) }),
  encode: encodeText,
  createEmpty: (style = DEFAULT_STYLE) =>
    `<templates>${style.eol}</templates>${style.finalNewline ? style.eol : ''}`,
};

/** The encoding the XML declaration at the start of the text names, with the range of the name. */
function declaredEncoding(text: string): { name: string; range: TextRange } | undefined {
  const match = /^<\?xml\s[^?]*?\bencoding\s*=\s*(["'])([^"']*)\1/.exec(text);
  if (!match) {
    return undefined;
  }
  const name = match[2]!;
  const end = match[0].length - 1;
  return { name, range: [end - name.length, end] };
}
