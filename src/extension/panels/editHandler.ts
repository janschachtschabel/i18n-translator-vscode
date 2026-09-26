import * as vscode from 'vscode';
import { planEdit, type BundleEdit, type PlanResult } from '../../core/edit/planEdit';
import { displayKey, keyFromId } from '../../core/model/keys';
import type { PanelState, WebviewToHost } from '../../shared/protocol';
import type { Prompts } from '../commands/prompts';
import type { FileStore, WriteResult } from '../services/fileStore';
import { rootRef, type WorkspaceIndex } from '../services/workspaceIndex';
import { describeWriteFailure, showWriteFailure } from '../services/writeFeedback';
import { findBundle, inBundle, missingBundle } from './findBundle';

export type EditRequest = Extract<WebviewToHost, { type: 'edit' }>;

/** How an edit went; `message` (in the user's language) says why it did not, if the user should know. */
export interface EditAnswer {
  ok: boolean;
  message?: string;
  /** The text changed in the meantime (B5): the editor offers the user's text against the new one. */
  conflict?: true;
}

/**
 * Writes the text of a cell (B1): planned with the text the cell showed (B5) and written by the file store,
 * which plans again on fresh texts if the file changed. It plans on the index first, so that a cell that is out
 * of date gets its reason and no question, and a text is only cleared (B2) after the user confirms. Failures
 * that need a step of the user (save a file, trust the workspace) also get a notification that offers it.
 */
export async function applyEdit(
  request: EditRequest,
  target: PanelState,
  services: { index: WorkspaceIndex; fileStore: FileStore; prompts: Prompts },
): Promise<EditAnswer> {
  if (!vscode.workspace.isTrusted) {
    return failed({ ok: false, reason: 'untrusted' });
  }
  // A write answers before its files are indexed again, and the editor may send the next text against it at
  // once: plan on the index that has it, or that text would count as changed.
  await services.fileStore.indexed();
  // The bundle may go between the edit and a new plan (e.g. a branch switch): a problem, not a crash.
  const found = findBundle(await services.index.latest(), target);
  if (!found) {
    return failed({ ok: false, reason: 'problem', problem: missingBundle(target.bundleId) });
  }
  const edit: BundleEdit = {
    kind: 'setText',
    entryId: request.entryId,
    locale: request.locale,
    value: request.value,
    before: request.before,
  };
  const planned = planEdit(found.bundle, edit);
  if (!planned.ok) {
    return failed({ ok: false, reason: 'problem', problem: planned.problem });
  }
  // Clearing deletes the text, so that the fallback applies (B2): not what "empty" suggests, so ask first.
  if (deletes(planned) && !(await confirmClear(services.prompts, request, found.bundle.reference))) {
    return { ok: false };
  }
  const result = await services.fileStore.write(
    rootRef(found.root),
    inBundle(target.bundleId, (bundle) => planEdit(bundle, edit)),
  );
  return result.ok ? { ok: true } : failed(result);
}

/** The answer to a failed edit; a failure that needs a step of the user is also shown with that step. */
function failed(result: Exclude<WriteResult, { ok: true }>): EditAnswer {
  if (result.reason !== 'problem') {
    void showWriteFailure(result);
  }
  const conflict = result.reason === 'problem' && result.problem.code === 'changed';
  return { ok: false, message: describeWriteFailure(result), ...(conflict ? { conflict } : {}) };
}

function deletes(planned: Extract<PlanResult, { ok: true }>): boolean {
  return planned.changes.some(
    (change) => change.kind === 'edit' && change.ops.some((op) => op.kind === 'delete'),
  );
}

function confirmClear(
  prompts: Prompts,
  request: EditRequest,
  reference: string | undefined,
): Promise<boolean> {
  const args = { key: displayKey(keyFromId(request.entryId)), locale: request.locale };
  const question =
    reference === undefined
      ? vscode.l10n.t('Delete the {locale} text of {key}?', args)
      : vscode.l10n.t('Delete the {locale} text of {key}? Without it, the text in {reference} appears.', {
          ...args,
          reference,
        });
  return prompts.confirm(question, vscode.l10n.t('Delete Text'));
}
