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
  decode: decodeText,
  parse: (doc) => parseProperties(doc.text),
  applyOps: (doc, ops) => ({ ...doc, text: applyPropertiesOps(doc.text, ops) }),
  encode: (doc) =>
    encodeText(doc.encoding === 'latin-1' ? { ...doc, text: escapeBeyondLatin1(doc.text) } : doc),
  createEmpty: () => '',
};
