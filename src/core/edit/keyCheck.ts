import type { AreaDefinition } from '../area/areaDefinition';
import type { Bundle } from '../model/bundle';
import { displayKey, type EntryKey } from '../model/keys';
import { editProblem, editWarning, type EditProblem, type EditWarning } from './editMessages';

export interface KeyCheck {
  problem?: EditProblem;
  warnings: EditWarning[];
}

/**
 * Whether `key` can be added to the bundle: every segment named, not there yet, and no text on its path or
 * below it (a key is either a text or an object). For a rename, the renamed key counts as well: moving `A` to
 * `A.B` would need `A` as a text and as an object at once.
 */
export function newKeyProblem(key: EntryKey, bundle: Bundle): EditProblem | undefined {
  if (key.segments.length === 0 || key.segments.some((segment) => segment.trim() === '')) {
    return editProblem('invalid-key', {});
  }
  if (bundle.keys.some((existing) => existing.id === key.id)) {
    return editProblem('key-exists', { key: displayKey(key), bundle: bundle.name });
  }
  const blocker = collidingKey(bundle.keys, key);
  return blocker && editProblem('path-conflict', { key: displayKey(key), other: displayKey(blocker) });
}

/** An existing text on the path of `key` (`A` for `A.B`) or below it (`A.B` for `A`). */
export function collidingKey(existing: readonly EntryKey[], key: EntryKey): EntryKey | undefined {
  return existing.find(
    (other) => isPrefix(other.segments, key.segments) || isPrefix(key.segments, other.segments),
  );
}

/**
 * {@link newKeyProblem} plus the warning dialogs need: with shallow merging, a top-level key that another bundle
 * of the root also has replaces the other one completely at runtime (edu-sharing: "exists in common").
 */
export function checkNewKey(
  key: EntryKey,
  bundle: Bundle,
  bundles: readonly Bundle[],
  area: AreaDefinition,
): KeyCheck {
  const problem = newKeyProblem(key, bundle);
  if (problem) {
    return { problem, warnings: [] };
  }
  const top = key.segments[0]!;
  const sharing =
    area.mergeSemantics === 'shallow-toplevel'
      ? bundles.filter(
          (other) =>
            other.id !== bundle.id &&
            other.root === bundle.root &&
            other.locales.some((locale) => other.file(locale)?.parsed.topLevelKeys.includes(top)),
        )
      : [];
  return {
    warnings:
      sharing.length > 0
        ? [
            editWarning('exists-in-other-bundle', {
              top,
              bundles: sharing.map((other) => other.name).join(', '),
            }),
          ]
        : [],
  };
}

/** `prefix` is a proper prefix of `path`. */
function isPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.length < path.length && prefix.every((segment, index) => segment === path[index]);
}
