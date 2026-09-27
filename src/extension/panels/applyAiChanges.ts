import { planTexts, type BatchPlan } from '../../core/edit/planTexts';
import type { Bundle } from '../../core/model/bundle';
import type { AiApplyItem } from '../../shared/aiProtocol';
import { localize } from '../localize';
import type { FileStore } from '../services/fileStore';
import { rootRef, type IndexedRoot } from '../services/workspaceIndex';
import { describeWriteFailure, showWriteFailure } from '../services/writeFeedback';
import { inBundle } from './findBundle';

/** How a write of reviewed texts went, for the webview. */
export interface ApplyOutcome {
  written: string[];
  skipped: { entryId: string; message: string }[];
  message?: string;
}

/**
 * Writes reviewed texts of a language (of a fill or a check) as one change of its file (planTexts), always backed up
 * first, and one step of undo. Texts that changed meanwhile or that the file cannot hold are skipped with their
 * reason; a failure of the whole write (Restricted Mode, a file with unsaved changes) says why, and offers the step
 * that solves it.
 */
export async function applyAiChanges(
  fileStore: FileStore,
  found: { root: IndexedRoot; bundle: Bundle },
  locale: string,
  items: readonly AiApplyItem[],
): Promise<ApplyOutcome> {
  let plan: BatchPlan | undefined;
  const result = await fileStore.write(
    rootRef(found.root),
    inBundle(found.bundle.id, (bundle) => {
      // Planned once, on the files as they are when written (B5); a plan of nothing writes and backs up nothing.
      plan = planTexts(bundle, locale, items);
      return { ok: true, changes: plan.changes };
    }),
    { bulk: true },
  );
  if (!result.ok) {
    if (result.reason !== 'problem') {
      void showWriteFailure(result);
    }
    return { written: [], skipped: [], message: describeWriteFailure(result) };
  }
  return {
    written: plan?.planned ?? [],
    skipped: (plan?.skipped ?? []).map(({ entryId, problem }) => ({
      entryId,
      message: localize(problem.message),
    })),
  };
}
