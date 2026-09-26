import type { FileOp } from '../formats/adapter';
import type { Bundle } from '../model/bundle';
import { displayKey, keyFromId, type EntryKey } from '../model/keys';
import type { LocaleCode } from '../model/types';
import { editProblem, type EditProblem } from './editMessages';
import { planSetText, type FileChange } from './planEdit';

/** A text for a cell; `before` is the text it was made for (null: none), which the plan checks (B5). */
export interface TextItem {
  entryId: string;
  value: string;
  before: string | null;
}

export interface BatchPlan {
  /** One change of the language's file, or none. */
  changes: FileChange[];
  /** The entries whose texts the changes write, in the order of the bundle's keys. */
  planned: string[];
  /** Texts that cannot be written, with the reason; the others are planned all the same. */
  skipped: { entryId: string; problem: EditProblem }[];
}

/**
 * Plans many texts of one language of a bundle as one change, e.g. the reviewed suggestions of the AI: in the order
 * of the bundle's keys, so that a new key goes after the keys the same change puts before it, and a missing object
 * is created once for all its texts. A text that changed meanwhile or that the file cannot hold is skipped with its
 * reason. An empty text is skipped too: a batch never deletes, since deleting a text asks first in the editor (B2).
 */
export function planTexts(bundle: Bundle, locale: LocaleCode, items: readonly TextItem[]): BatchPlan {
  const order = new Map(bundle.keys.map((key, index) => [key.id, index]));
  const position = (item: TextItem) => order.get(item.entryId) ?? Number.POSITIVE_INFINITY;
  const sorted = [...items].sort((a, b) => position(a) - position(b));
  const inserted: EntryKey[] = [];
  const ops: FileOp[] = [];
  const planned: string[] = [];
  const skipped: BatchPlan['skipped'] = [];
  let relPath: string | undefined;
  for (const item of sorted) {
    if (planned.includes(item.entryId)) {
      continue;
    }
    if (item.value.trim() === '') {
      const key = displayKey(keyFromId(item.entryId));
      skipped.push({ entryId: item.entryId, problem: editProblem('empty-text', { key, locale }) });
      continue;
    }
    const result = planSetText(bundle, item.entryId, locale, item.value, item.before, inserted);
    if (!result.ok) {
      skipped.push({ entryId: item.entryId, problem: result.problem });
      continue;
    }
    for (const change of result.changes) {
      // A text is always set in its language's file, which exists (planSetText refuses a missing one).
      if (change.kind === 'edit') {
        relPath = change.relPath;
        ops.push(...change.ops);
        inserted.push(...change.ops.flatMap((op) => (op.kind === 'insert' ? [op.key] : [])));
      }
    }
    if (result.changes.length > 0) {
      planned.push(item.entryId);
    }
  }
  return { changes: relPath === undefined ? [] : [{ kind: 'edit', relPath, ops }], planned, skipped };
}
