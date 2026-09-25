import { describe, expect, it } from 'vitest';
import { revisionOf } from '../../../../src/core/util/hash';

const bytes = (text: string) => new TextEncoder().encode(text);

/** FNV-1a 64 with BigInt: slow, but plainly the algorithm. */
function reference(data: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of data) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

describe('revisionOf', () => {
  it('computes FNV-1a with 64 bits', () => {
    expect(revisionOf(bytes(''))).toBe('cbf29ce484222325');
    expect(revisionOf(bytes('a'))).toBe('af63dc4c8601ec8c');
    expect(revisionOf(bytes('foobar'))).toBe('85944171f73967e8');
  });

  it('agrees with the plain algorithm on arbitrary bytes and on every byte value', () => {
    // A 32-bit linear congruential generator in integer arithmetic; its high bits vary best.
    let seed = 42;
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
    for (let run = 0; run < 200; run++) {
      const data = Uint8Array.from({ length: (next() >>> 16) % 300 }, () => next() >>> 24);
      expect(revisionOf(data)).toBe(reference(data));
    }
    const everyByte = Uint8Array.from({ length: 256 }, (_, value) => value);
    expect(revisionOf(everyByte)).toBe(reference(everyByte));
  });

  it('tells files apart that differ in one byte', () => {
    expect(revisionOf(bytes('{"A": "1"}'))).not.toBe(revisionOf(bytes('{"A": "2"}')));
  });
});
