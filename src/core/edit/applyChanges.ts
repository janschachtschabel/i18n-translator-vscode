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
 * Applies planned changes, in memory, to the files of the bundles they were planned on. Writes nothing. The
 * writer can still refuse an operation for something the model does not show (an empty object or a value that
 * is not a text in the way); that becomes a problem like the ones of planning.
 */
export function applyChanges(
  changes: readonly FileChange[],
  bundles: readonly Bundle[],
  adapter: FormatAdapter,
): ApplyResult {
  const writes: FileWrite[] = [];
  for (const change of changes) {
    if (change.kind === 'create') {
      const after: DecodedText = { text: change.content, encoding: 'utf-8', bom: false };
      writes.push({ relPath: change.relPath, before: undefined, after });
      continue;
    }
    const { bundle, file } = fileAt(bundles, change.relPath);
    try {
      writes.push({ relPath: file.relPath, before: file.doc, after: adapter.applyOps(file.doc, change.ops) });
    } catch (error) {
      if (!(error instanceof EditError)) {
        throw error;
      }
      return { ok: false, problem: writerProblem(error, file.relPath, bundle.name) };
    }
  }
  return { ok: true, writes };
}

function fileAt(bundles: readonly Bundle[], relPath: string): { bundle: Bundle; file: LoadedFile } {
  for (const bundle of bundles) {
    const file = bundle.locales
      .map((locale) => bundle.file(locale))
      .find((candidate) => candidate?.relPath === relPath);
    if (file) {
      return { bundle, file };
    }
  }
  throw new RangeError(`${relPath} is not a file of the bundles the changes were planned on.`);
}

function writerProblem(error: EditError, file: string, bundle: string): EditProblem {
  const key = error.key && displayKey(error.key);
  if (key === undefined || error.code === 'unparsable') {
    return editProblem('unreadable-file', { file });
  }
  if (error.code === 'missing-key') {
    return editProblem('missing-key', { key, bundle });
  }
  // Planning sees every text of the bundle, so what is in the way here is an object or a value that is not a
  // text: at the key itself, or on its path (then the writer names that path).
  return error.code === 'path-conflict' && error.other
    ? editProblem('path-conflict', { key, other: displayKey(error.other) })
    : editProblem('not-a-text', { key, file });
}
