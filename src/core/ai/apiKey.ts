const MAX_KEY_LENGTH = 512;

/**
 * Why a typed key cannot be one, before it is trimmed; undefined if it can. A key is visible ASCII, as a header
 * carries it: a zero-width space, which copying from a web page may add, survives trimming and would fail every
 * request as if the network were down.
 */
export function keyProblem(value: string): 'empty' | 'blank' | 'characters' | 'too-long' | undefined {
  const key = value.trim();
  if (key === '') {
    return 'empty';
  }
  if (/\s/.test(key)) {
    return 'blank';
  }
  if (!/^[\x21-\x7E]+$/.test(key)) {
    return 'characters';
  }
  return key.length > MAX_KEY_LENGTH ? 'too-long' : undefined;
}
