import { decodeText } from '../../text/decode';
import { encodeText } from '../../text/encode';
import { DEFAULT_STYLE } from '../../text/style';
import type { FormatAdapter } from '../adapter';
import { MAIL_FIELDS, parseMail } from './mailRead';
import { applyMailOps } from './mailWrite';
import { firstInvalidCharacter } from './xmlTokens';

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
  decode: decodeText,
  parse(doc) {
    const parsed = parseMail(doc.text);
    // Without a declaration, Java's XML parser reads UTF-8 and fails on the bytes of another encoding.
    return doc.encoding === 'utf-8'
      ? parsed
      : { ...parsed, problems: [{ code: 'not-utf8', range: [0, 0] }, ...parsed.problems] };
  },
  applyOps: (doc, ops) => ({ ...doc, text: applyMailOps(doc, ops) }),
  encode: encodeText,
  createEmpty: (style = DEFAULT_STYLE) =>
    `<templates>${style.eol}</templates>${style.finalNewline ? style.eol : ''}`,
};
