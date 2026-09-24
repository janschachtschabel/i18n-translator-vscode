import * as vscode from 'vscode';
import { countBySeverity } from '../../core/report/summary';
import type { WorkspaceIndex } from '../services/workspaceIndex';

/**
 * Checks all translation files again and reports the result. The notification is not awaited: it stays
 * until the user closes it, while the check itself is done.
 */
export async function checkTranslations(index: WorkspaceIndex): Promise<void> {
  const snapshot = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Checking translations…') },
    () => index.refresh(),
  );
  if (snapshot.roots.length === 0) {
    const configure = vscode.l10n.t('Configure Folders');
    void vscode.window
      .showWarningMessage(vscode.l10n.t('No translation files were found.'), configure)
      .then((choice) => choice === configure && vscode.commands.executeCommand('eduI18n.configureRoots'));
    return;
  }
  const numbers = new Intl.NumberFormat(vscode.env.language);
  const counts = countBySeverity(snapshot.roots.flatMap((root) => root.analysis.issues));
  const showProblems = vscode.l10n.t('Show Problems');
  void vscode.window
    .showInformationMessage(
      vscode.l10n.t('Check finished. Errors: {errors}, warnings: {warnings}.', {
        errors: numbers.format(counts.error),
        warnings: numbers.format(counts.warning),
      }),
      showProblems,
    )
    .then(
      (choice) =>
        choice === showProblems && vscode.commands.executeCommand('workbench.actions.view.problems'),
    );
}
