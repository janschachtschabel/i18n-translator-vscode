/**
 * FNV-1a with 64 bits, as 16 hex digits: tells whether a file still has the bytes it had, e.g. before an undo.
 * It detects changes; it is not a cryptographic hash and does not resist deliberate collisions.
 */
export function revisionOf(bytes: Uint8Array): string {
  // The 64-bit state in four 16-bit parts, lowest first, so that every product stays exact in a double.
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  for (const byte of bytes) {
    h0 ^= byte;
    // Times the prime 2^40 + 0x1b3: the state times 0x1b3, plus the state moved up by two parts and 8 bits.
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3 + (t0 >>> 16);
    const t2 = h2 * 0x1b3 + (h0 << 8) + (t1 >>> 16);
    const t3 = h3 * 0x1b3 + (h1 << 8) + (t2 >>> 16);
    h0 = t0 & 0xffff;
    h1 = t1 & 0xffff;
    h2 = t2 & 0xffff;
    h3 = t3 & 0xffff;
  }
  return [h3, h2, h1, h0].map((part) => part.toString(16).padStart(4, '0')).join('');
}
