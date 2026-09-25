import * as vscode from 'vscode';
import type { BackupReason, BackupService } from '../services/backupService';
import { messageOf } from '../services/errors';
import type { FileStore } from '../services/fileStore';
import { showWriteFailure } from '../services/writeFeedback';

const REASONS: Readonly<Record<BackupReason, () => string>> = {
  'first-write': () => vscode.l10n.t('Before the first change of a session'),
  'several-bundles': () => vscode.l10n.t('Before a change of several bundles'),
  interval: () => vscode.l10n.t('Periodically while editing'),
  manual: () => vscode.l10n.t('Created by hand'),
  restore: () => vscode.l10n.t('Before restoring a backup'),
};

/** "Back up translation files now", between writes, so that no change is caught half-written. */
export async function backUpNow(
  backups: BackupService,
  store: FileStore,
  log: vscode.LogOutputChannel,
): Promise<void> {
  try {
    const backup = await store.exclusive(() => backups.create('manual'));
    void vscode.window.showInformationMessage(
      backup
        ? vscode.l10n.t('Backup created. Files: {count}', { count: backup.files })
        : vscode.l10n.t('There are no translation files to back up.'),
    );
  } catch (error) {
    log.error('Backing up the translation files failed.', error);
    void vscode.window.showErrorMessage(
      vscode.l10n.t('The translation files could not be backed up: {error}', { error: messageOf(error) }),
    );
  }
}

/** "Restore translation files from a backup…": choose, confirm, and restore through the file store. */
export async function restoreBackup(
  backups: BackupService,
  store: FileStore,
  log: vscode.LogOutputChannel,
): Promise<void> {
  try {
    await restore(backups, store);
  } catch (error) {
    log.error('Restoring the translation files failed.', error);
    void vscode.window.showErrorMessage(
      vscode.l10n.t('The translation files could not be restored: {error}', { error: messageOf(error) }),
    );
  }
}

async function restore(backups: BackupService, store: FileStore): Promise<void> {
  const list = await backups.list();
  if (list.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('There are no backups yet.'));
    return;
  }
  const picked = await vscode.window.showQuickPick(
    list.map((backup) => ({
      label: backup.created.toLocaleString(vscode.env.language),
      description: vscode.l10n.t('Files: {count}', { count: backup.files }),
      detail: REASONS[backup.reason](),
      backup,
    })),
    { title: vscode.l10n.t('Restore Translation Files'), placeHolder: vscode.l10n.t('Backup to restore') },
  );
  if (!picked) {
    return;
  }
  const { files, skipped } = await backups.read(picked.backup.id);
  if (files.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('The backup has no files in the open folders.'));
    return;
  }
  const confirm = vscode.l10n.t('Restore');
  const answer = await vscode.window.showWarningMessage(
    vscode.l10n.t('Restore the translation files from {time}? The current state is backed up first.', {
      time: picked.label,
    }),
    { modal: true },
    confirm,
  );
  if (answer !== confirm) {
    return;
  }
  const result = await store.restore(files);
  if (!result.ok) {
    await showWriteFailure(result);
    return;
  }
  void vscode.window.showInformationMessage(
    skipped > 0
      ? vscode.l10n.t('The translation files from {time} were restored. Skipped files: {count}', {
          time: picked.label,
          count: skipped,
        })
      : vscode.l10n.t('The translation files from {time} were restored.', { time: picked.label }),
  );
}
