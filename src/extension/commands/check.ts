import * as vscode from 'vscode';
import { countBySeverity } from '../../core/report/summary';
import type { WorkspaceIndex } from '../services/workspaceIndex';
import { showInfo, showWarning } from '../notify';

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
    void showWarning(vscode.l10n.t('No translation files were found.'), configure).then(
      (choice) => choice === configure && vscode.commands.executeCommand('eduI18n.configureRoots'),
    );
    return;
  }
  const numbers = new Intl.NumberFormat(vscode.env.language);
  const counts = countBySeverity(snapshot.roots.flatMap((root) => root.analysis.issues));
  const showProblems = vscode.l10n.t('Show Problems');
  const result = vscode.l10n.t('Check finished. Errors: {errors}, warnings: {warnings}.', {
    errors: numbers.format(counts.error),
    warnings: numbers.format(counts.warning),
  });
  // Unreadable files or unusable settings mean that part of the check did not run; the sidebar lists them.
  const shown =
    snapshot.errors.length > 0
      ? showWarning(
          `${result} ${vscode.l10n.t('Problems while indexing: {0}', numbers.format(snapshot.errors.length))}`,
          showProblems,
        )
      : showInfo(result, showProblems);
  void shown.then(
    (choice) => choice === showProblems && vscode.commands.executeCommand('workbench.actions.view.problems'),
  );
}
