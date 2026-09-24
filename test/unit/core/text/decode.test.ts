import { describe, expect, it } from 'vitest';
import { decodeText } from '../../../../src/core/text/decode';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('decodeText', () => {
  it('decodes valid UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('Größe'))).toEqual({
      text: 'Größe',
      encoding: 'utf-8',
      bom: false,
    });
  });

  it('strips and reports a UTF-8 byte order mark', () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x7b, 0x7d))).toEqual({
      text: '{}',
      encoding: 'utf-8',
      bom: true,
    });
  });

  it('falls back to ISO-8859-1 for invalid UTF-8', () => {
    expect(decodeText(bytes(0x47, 0x72, 0xf6, 0xdf, 0x65))).toEqual({
      text: 'Größe',
      encoding: 'latin-1',
      bom: false,
    });
  });

  it('decodes ISO-8859-1 files larger than one conversion chunk', () => {
    const decoded = decodeText(new Uint8Array(0x8000 + 10).fill(0xe4));
    expect(decoded.encoding).toBe('latin-1');
    expect(decoded.text).toBe('ä'.repeat(0x8000 + 10));
  });

  it('keeps the byte order mark flag when the rest is not UTF-8', () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0xf6))).toEqual({ text: 'ö', encoding: 'latin-1', bom: true });
  });

  it('maps every byte to the same code point, unlike windows-1252', () => {
    expect(decodeText(bytes(0x80, 0x9f)).text).toBe('\u0080\u009f');
  });
});
