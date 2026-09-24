import { describe, expect, it } from 'vitest';
import { decodeText } from '../../../../src/core/text/decode';
import { encodeText } from '../../../../src/core/text/encode';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('encodeText', () => {
  it('writes UTF-8, with the byte order mark only if the file had one', () => {
    expect([...encodeText({ text: 'Größe', encoding: 'utf-8', bom: false })]).toEqual([
      0x47, 0x72, 0xc3, 0xb6, 0xc3, 0x9f, 0x65,
    ]);
    expect([...encodeText({ text: '{}', encoding: 'utf-8', bom: true })]).toEqual([
      0xef, 0xbb, 0xbf, 0x7b, 0x7d,
    ]);
  });

  it('writes ISO-8859-1 files back byte for byte', () => {
    for (const original of [
      bytes(0x47, 0x72, 0xf6, 0xdf, 0x65),
      bytes(0xef, 0xbb, 0xbf, 0xf6),
      bytes(0x80, 0x9f),
    ]) {
      expect([...encodeText(decodeText(original))]).toEqual([...original]);
    }
  });

  it('refuses characters that ISO-8859-1 cannot hold', () => {
    expect(() => encodeText({ text: 'a€b', encoding: 'latin-1', bom: false })).toThrow(RangeError);
  });
});
