import * as vscode from 'vscode';
import type { FileStore } from '../services/fileStore';
import { relative } from '../services/files';
import { showWriteFailure } from '../services/writeFeedback';
import { showInfo, showWarning } from '../notify';

/**
 * Undoes the last change of this session to the translation files, in any bundle, and says which files it
 * restored: the change may be in a bundle that is not on screen. `accept` may keep the change (see
 * {@link FileStore.undo}).
 */
export async function undoLastChange(
  fileStore: FileStore,
  accept?: (files: readonly vscode.Uri[]) => Promise<boolean>,
): Promise<void> {
  const result = await fileStore.undo(accept);
  if (!result) {
    void showInfo(vscode.l10n.t('There is no change to undo.'));
  } else if (result.ok) {
    void showInfo(vscode.l10n.t('Undone: {files}', { files: result.files.map(relative).join(', ') }));
  } else if (result.reason === 'changed') {
    // The file store dropped this undo for good; "nothing was written" would invite another try, which would
    // undo an older change instead.
    void showWarning(
      vscode.l10n.t('{files} changed after the last change, so it can no longer be undone.', {
        files: result.files.map(relative).join(', '),
      }),
    );
  } else if (result.reason !== 'declined') {
    // A declined undo needs no message: the user kept the change.
    await showWriteFailure(result);
  }
}
