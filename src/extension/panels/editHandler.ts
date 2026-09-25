import * as vscode from 'vscode';
import { editProblem } from '../../core/edit/editMessages';
import { planEdit, type PlanResult } from '../../core/edit/planEdit';
import { parseBundleId } from '../../core/model/bundle';
import { displayKey, keyFromId } from '../../core/model/keys';
import type { PanelState, WebviewToHost } from '../../shared/protocol';
import { rootRef, type FileStore } from '../services/fileStore';
import type { WorkspaceIndex } from '../services/workspaceIndex';
import { describeWriteFailure, showWriteFailure } from '../services/writeFeedback';
import { findBundle } from './bundleTarget';

export type EditRequest = Extract<WebviewToHost, { type: 'edit' }>;

/** How an edit went; `message` (in the user's language) says why it did not, if the user should know. */
export interface EditAnswer {
  ok: boolean;
  message?: string;
}

/**
 * Writes the text of a cell (B1): planned with the text the cell showed (B5) and written by the file store,
 * which plans again on fresh texts if the file changed. Failures that need a step of the user (save a file,
 * trust the workspace) also get a notification that offers it.
 */
export async function applyEdit(
  request: EditRequest,
  target: PanelState,
  services: { index: WorkspaceIndex; fileStore: FileStore },
): Promise<EditAnswer> {
  // The bundle may go between the edit and a new plan (e.g. a branch switch): a problem, not a crash.
  const problem = editProblem('missing-bundle', { bundle: parseBundleId(target.bundleId).name });
  const gone: PlanResult = { ok: false, problem };
  const found = findBundle(services.index.current() ?? (await services.index.refresh()), target);
  if (!found) {
    return { ok: false, message: describeWriteFailure({ ok: false, reason: 'problem', problem }) };
  }
  if (request.value === '' && request.before !== null && request.locale !== found.bundle.reference) {
    // Clearing deletes the text, so that the fallback applies (B2): not what "empty" suggests, so ask first.
    if (!(await confirmClear(request, found.bundle.reference))) {
      return { ok: false };
    }
  }
  const result = await services.fileStore.write(rootRef(found.root), (analysis) => {
    const bundle = analysis.bundles.find((candidate) => candidate.id === target.bundleId);
    return bundle
      ? planEdit(bundle, {
          kind: 'setText',
          entryId: request.entryId,
          locale: request.locale,
          value: request.value,
          before: request.before,
        })
      : gone;
  });
  if (result.ok) {
    return { ok: true };
  }
  if (result.reason !== 'problem') {
    void showWriteFailure(result);
  }
  return { ok: false, message: describeWriteFailure(result) };
}

async function confirmClear(request: EditRequest, reference: string | undefined): Promise<boolean> {
  const args = { key: displayKey(keyFromId(request.entryId)), locale: request.locale };
  const question =
    reference === undefined
      ? vscode.l10n.t('Delete the {locale} text of {key}?', args)
      : vscode.l10n.t('Delete the {locale} text of {key}? Without it, the text in {reference} appears.', {
          ...args,
          reference,
        });
  const remove = vscode.l10n.t('Delete Text');
  return (await vscode.window.showWarningMessage(question, { modal: true }, remove)) === remove;
}
