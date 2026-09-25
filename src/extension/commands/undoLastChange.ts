import * as vscode from 'vscode';
import type { FileStore } from '../services/fileStore';
import { showWriteFailure } from '../services/writeFeedback';

/** Undoes the last change of this session to the translation files, in any bundle, and says how it went. */
export async function undoLastChange(fileStore: FileStore): Promise<void> {
  const result = await fileStore.undo();
  if (!result) {
    void vscode.window.showInformationMessage(vscode.l10n.t('There is no change to undo.'));
  } else if (result.ok) {
    void vscode.window.showInformationMessage(vscode.l10n.t('The last change was undone.'));
  } else {
    await showWriteFailure(result);
  }
}
