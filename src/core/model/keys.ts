/**
 * Key of an entry as a path of segments. Segments may contain dots (`mail.smtp.server`), so the key is
 * never split or joined on dots internally; the dotted form is for display only.
 */
export interface EntryKey {
  /** Stable, unambiguous id: the JSON-encoded segment list. */
  readonly id: string;
  readonly segments: readonly string[];
}

export function keyFromSegments(segments: readonly string[]): EntryKey {
  if (segments.length === 0) {
    throw new RangeError('An entry key needs at least one segment.');
  }
  return { id: JSON.stringify(segments), segments: [...segments] };
}

/** Restores a key from {@link EntryKey.id}; throws if the id was not produced by {@link keyFromSegments}. */
export function keyFromId(id: string): EntryKey {
  let segments: unknown;
  try {
    segments = JSON.parse(id);
  } catch {
    throw new RangeError(`Not an entry key id: ${id}`);
  }
  if (!Array.isArray(segments) || !segments.every((segment) => typeof segment === 'string')) {
    throw new RangeError(`Not an entry key id: ${id}`);
  }
  const key = keyFromSegments(segments);
  // Ids are compared as strings, so '[ "a" ]' must not pass for the id of ["a"].
  if (key.id !== id) {
    throw new RangeError(`Not an entry key id: ${id}`);
  }
  return key;
}

export function displayKey(key: EntryKey): string {
  return key.segments.join('.');
}
