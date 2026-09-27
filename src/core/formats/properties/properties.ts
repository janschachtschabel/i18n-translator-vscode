import { VALUE_FIELD } from '../../model/types';
import { decodeText } from '../../text/decode';
import { encodeText } from '../../text/encode';
import { escapeBeyondLatin1 } from '../../text/unicodeEscape';
import type { FormatAdapter } from '../adapter';
import { parseProperties } from './propertiesRead';
import { applyPropertiesOps } from './propertiesWrite';

/**
 * Java .properties files (edu-sharing metadatasets). Each file keeps its encoding: UTF-8, or ISO-8859-1, which Java
 * reads on purpose when a file is not UTF-8, so it is no finding.
 */
export const propertiesAdapter: FormatAdapter = {
  id: 'properties',
  flatKeys: true,
  decode: decodeText,
  parse(doc) {
    const parsed = parseProperties(doc.text);
    // Java's UTF-8 reader keeps a byte order mark, and Properties.load takes it for a character of the first line's
    // key: a key there is lost, also after white space, which Java skips only after the mark (audit L-25).
    const firstLineEnd = doc.text.search(/[\r\n]/);
    const first = parsed.entries.find(
      (entry) => firstLineEnd === -1 || entry.fields[VALUE_FIELD]!.keyRange[0] < firstLineEnd,
    );
    return doc.bom && first
      ? {
          ...parsed,
          problems: [
            { code: 'bom-first-key', range: first.fields[VALUE_FIELD]!.keyRange, key: first.key },
            ...parsed.problems,
          ],
        }
      : parsed;
  },
  entryLine: (doc, entry) => {
    const { keyRange, valueRange } = entry.fields[VALUE_FIELD]!;
    return doc.text.slice(keyRange[0], valueRange[1]);
  },
  applyOps: (doc, ops) => ({ ...doc, text: applyPropertiesOps(doc.text, ops, doc.bom) }),
  encode: (doc) =>
    encodeText(doc.encoding === 'latin-1' ? { ...doc, text: escapeBeyondLatin1(doc.text) } : doc),
  createEmpty: () => '',
};
