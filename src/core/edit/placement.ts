import type { ParsedEntry } from '../formats/adapter';
import type { LoadedFile } from '../model/bundle';
import { isKeyPrefix, keyFromSegments, type EntryKey } from '../model/keys';
import { VALUE_FIELD } from '../model/types';

/**
 * Where a new key goes in a file, so that the file keeps the order of the reference: after the nearest key at
 * or before position `from` of `keys` that the file has inside the key's deepest parent object in that file.
 * The anchor is cut to the level where the new entry starts, so a text that follows `OBJ.X` goes after the
 * object `OBJ`, and a missing parent object goes after its predecessor. `first`: the file has no such key, so the
 * entry goes first in that parent object, but after the hidden entries that open the file.
 */
export function insertAnchor(
  keys: readonly EntryKey[],
  from: number,
  file: LoadedFile,
  key: EntryKey,
): EntryKey | 'first' {
  const present = file.parsed.entries.map((entry) => entry.key);
  // The parent objects that the file has are those that contain one of its texts.
  let depth = key.segments.length - 1;
  while (depth > 0 && !present.some((other) => isKeyPrefix(key.segments.slice(0, depth), other.segments))) {
    depth--;
  }
  const parent = key.segments.slice(0, depth);
  const inFile = new Set(present.map((other) => other.id));
  for (let position = from; position >= 0; position--) {
    const candidate = keys[position]!;
    if (inFile.has(candidate.id) && isKeyPrefix(parent, candidate.segments)) {
      return keyFromSegments(candidate.segments.slice(0, depth + 1));
    }
  }
  return depth === 0 ? (openingHidden(file) ?? 'first') : 'first';
}

/**
 * The last hidden entry before the first text of the file: edu-sharing's metadataset files begin with a guard line
 * the runtime never reads, and a text in its place would never be read either.
 */
function openingHidden(file: LoadedFile): EntryKey | undefined {
  const start = (entry: ParsedEntry) => entry.fields[VALUE_FIELD]!.keyRange[0];
  const firstText = file.parsed.entries[0];
  return (file.hidden ?? [])
    .filter((entry) => firstText === undefined || start(entry) < start(firstText))
    .at(-1)?.key;
}

/** The position of an inserted entry: first in its object, after a sibling, or (undefined) last. */
export function placed(place: EntryKey | 'first' | undefined): { after?: EntryKey; first?: true } {
  return place === 'first' ? { first: true } : place ? { after: place } : {};
}
