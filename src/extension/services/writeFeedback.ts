import * as vscode from 'vscode';
import { localize } from '../localize';
import type { WriteResult } from './fileStore';
import { relative } from './files';

/** Tells the user why nothing was written, with the step that helps (show the file, manage trust). */
export async function showWriteFailure(result: Exclude<WriteResult, { ok: true }>): Promise<void> {
  const files = 'files' in result ? result.files.map(relative).join(', ') : '';
  switch (result.reason) {
    case 'problem':
      void vscode.window.showErrorMessage(localize(result.problem.message));
      return;
    case 'dirty': {
      const show = vscode.l10n.t('Show File');
      const answer = await vscode.window.showWarningMessage(
        vscode.l10n.t('Unsaved changes in {files}: save or discard them first. Nothing was written.', {
          files,
        }),
        show,
      );
      if (answer === show) {
        await vscode.window.showTextDocument(result.files[0]!);
      }
      return;
    }
    case 'changed':
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Changed in the meantime: {files}. Nothing was written.', { files }),
      );
      return;
    case 'untrusted': {
      const manage = vscode.l10n.t('Manage Workspace Trust');
      const answer = await vscode.window.showWarningMessage(
        vscode.l10n.t('Translation files can only be changed in a trusted workspace.'),
        manage,
      );
      if (answer === manage) {
        await vscode.commands.executeCommand('workbench.trust.manage');
      }
      return;
    }
    case 'error': {
      if (!result.notRestored?.length) {
        void vscode.window.showErrorMessage(
          vscode.l10n.t('The translation files could not be written: {error}', { error: result.message }),
        );
        return;
      }
      const restore = vscode.l10n.t('Restore from Backup…');
      const answer = await vscode.window.showErrorMessage(
        vscode.l10n.t(
          'The translation files could not be written: {error}. These files could not be restored and may be damaged: {files}.',
          { error: result.message, files: result.notRestored.map(relative).join(', ') },
        ),
        restore,
      );
      if (answer === restore) {
        await vscode.commands.executeCommand('eduI18n.restoreBackup');
      }
    }
  }
}
