import { EditError, type FormatAdapter } from '../formats/adapter';
import type { Bundle, LoadedFile } from '../model/bundle';
import { displayKey } from '../model/keys';
import type { DecodedText } from '../text/decode';
import { editProblem, type EditProblem } from './editMessages';
import type { FileChange } from './planEdit';

/** A file with its new text; `before` is the text it was planned on, undefined for a new file. */
export interface FileWrite {
  relPath: string;
  before: DecodedText | undefined;
  after: DecodedText;
}

export type ApplyResult = { ok: true; writes: FileWrite[] } | { ok: false; problem: EditProblem };

/**
 * Applies planned changes, in memory, to the files of the bundles they were planned on, one write per file:
 * later changes of a file apply to the text the earlier ones left (plans can be joined). Writes nothing. The
 * writer can still refuse an operation for something the model does not show (an empty object or a value that
 * is not a text in the way); that becomes a problem like the ones of planning.
 */
export function applyChanges(
  changes: readonly FileChange[],
  bundles: readonly Bundle[],
  adapter: FormatAdapter,
): ApplyResult {
  const writes = new Map<string, FileWrite>();
  for (const change of changes) {
    const earlier = writes.get(change.relPath);
    if (change.kind === 'create') {
      if (earlier) {
        throw new RangeError(`${change.relPath} is created after it was changed.`);
      }
      const after: DecodedText = { text: change.content, encoding: 'utf-8', bom: false };
      writes.set(change.relPath, { relPath: change.relPath, before: undefined, after });
      continue;
    }
    const found = findFile(bundles, change.relPath);
    const before = earlier ? earlier.before : found?.file.doc;
    const current = earlier ? earlier.after : found?.file.doc;
    if (!current) {
      throw new RangeError(`${change.relPath} is not a file of the bundles the changes were planned on.`);
    }
    try {
      writes.set(change.relPath, {
        relPath: change.relPath,
        before,
        after: adapter.applyOps(current, change.ops),
      });
    } catch (error) {
      if (!(error instanceof EditError)) {
        throw error;
      }
      return {
        ok: false,
        problem: writerProblem(error, change.relPath, found?.bundle.name ?? change.relPath),
      };
    }
  }
  return { ok: true, writes: [...writes.values()] };
}

function findFile(
  bundles: readonly Bundle[],
  relPath: string,
): { bundle: Bundle; file: LoadedFile } | undefined {
  for (const bundle of bundles) {
    const file = bundle.locales
      .map((locale) => bundle.file(locale))
      .find((candidate) => candidate?.relPath === relPath);
    if (file) {
      return { bundle, file };
    }
  }
  return undefined;
}

function writerProblem(error: EditError, file: string, bundle: string): EditProblem {
  const key = error.key && displayKey(error.key);
  if (key === undefined || error.code === 'unparsable') {
    return editProblem('unreadable-file', { file });
  }
  if (error.code === 'missing-key') {
    return editProblem('missing-key', { key, bundle });
  }
  // Planning sees every text of the bundle and refuses a text in the way, so what the writer finds is an object
  // or another value that is not a text: at the key itself, or on its path (then the writer names that path).
  return editProblem('not-a-text', { key: error.other ? displayKey(error.other) : key, file });
}
