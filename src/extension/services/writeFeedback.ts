import * as vscode from 'vscode';
import { localize } from '../localize';
import type { WriteResult } from './fileStore';
import { relative } from './files';

export type WriteFailure = Exclude<WriteResult, { ok: true }>;

/** Why nothing was written, in the user's language: for a notification, or for the editor's cell. */
export function describeWriteFailure(result: WriteFailure): string {
  const files = 'files' in result ? result.files.map(relative).join(', ') : '';
  switch (result.reason) {
    case 'problem':
      return localize(result.problem.message);
    case 'dirty':
      return vscode.l10n.t('Unsaved changes in {files}: save or discard them first. Nothing was written.', {
        files,
      });
    case 'changed':
      return vscode.l10n.t('Changed in the meantime: {files}. Nothing was written.', { files });
    case 'untrusted':
      return vscode.l10n.t('Translation files can only be changed in a trusted workspace.');
    case 'error':
      return result.notRestored?.length
        ? vscode.l10n.t(
            'The translation files could not be written: {error}. These files could not be restored and may be damaged: {files}.',
            { error: result.message, files: result.notRestored.map(relative).join(', ') },
          )
        : vscode.l10n.t('The translation files could not be written: {error}', { error: result.message });
  }
}

/** Tells the user why nothing was written, with the step that helps (show the file, manage trust). */
export async function showWriteFailure(result: WriteFailure): Promise<void> {
  const message = describeWriteFailure(result);
  switch (result.reason) {
    case 'problem':
      void vscode.window.showErrorMessage(message);
      return;
    case 'dirty': {
      const show = vscode.l10n.t('Show File');
      if ((await vscode.window.showWarningMessage(message, show)) === show) {
        await vscode.window.showTextDocument(result.files[0]!);
      }
      return;
    }
    case 'changed':
      void vscode.window.showWarningMessage(message);
      return;
    case 'untrusted': {
      const manage = vscode.l10n.t('Manage Workspace Trust');
      if ((await vscode.window.showWarningMessage(message, manage)) === manage) {
        await vscode.commands.executeCommand('workbench.trust.manage');
      }
      return;
    }
    case 'error': {
      if (!result.notRestored?.length) {
        void vscode.window.showErrorMessage(message);
        return;
      }
      const restore = vscode.l10n.t('Restore from Backup…');
      if ((await vscode.window.showErrorMessage(message, restore)) === restore) {
        await vscode.commands.executeCommand('eduI18n.restoreBackup');
      }
    }
  }
}
