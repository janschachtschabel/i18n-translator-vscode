import * as vscode from 'vscode';
import type { AreaDefinition } from '../../core/area/areaDefinition';
import { readSettings } from '../config';
import { relativeUriPath } from '../services/uriPaths';
import { showError, showInfo, showWarning } from '../notify';

type Roots = Readonly<Record<string, readonly string[]>>;

/**
 * Lets the user choose the root folders of an area, or return to automatic detection, and stores the
 * choice in `eduI18n.roots` of the workspace folder. The index re-runs on the configuration change.
 */
export async function configureRoots(): Promise<void> {
  // A window without a folder has no folder to store the choice in: opening one is the way in.
  if (!vscode.workspace.workspaceFolders?.length) {
    const open = vscode.l10n.t('Open Folder…');
    const choice = await showInfo(
      vscode.l10n.t(
        'Open a folder with edu-sharing translations first: an edu-sharing checkout, or its translation folder or a copy of it.',
      ),
      open,
    );
    if (choice === open) {
      await vscode.commands.executeCommand('vscode.openFolder');
    }
    return;
  }
  if (!vscode.workspace.isTrusted) {
    // eduI18n.roots is a restricted setting: workspace values are ignored until the workspace is trusted.
    const manage = vscode.l10n.t('Manage Workspace Trust');
    const choice = await showWarning(
      vscode.l10n.t('Translation folders can only be configured in a trusted workspace.'),
      manage,
    );
    if (choice === manage) {
      await vscode.commands.executeCommand('workbench.trust.manage');
    }
    return;
  }
  const folder = await pickWorkspaceFolder();
  const area = folder && (await pickArea(readSettings(folder.uri).settings.areas));
  if (!folder || !area) {
    return;
  }
  const config = vscode.workspace.getConfiguration('eduI18n', folder.uri);
  // Only the folder's own value: user-level roots must not be copied into the workspace settings.
  const current: Roots = config.inspect<Roots>('roots')?.workspaceFolderValue ?? {};

  const choose = { label: vscode.l10n.t('Choose Folders…') };
  const detect = { label: vscode.l10n.t('Detect Automatically'), detail: area.detect?.marker };
  const action = area.detect
    ? await vscode.window.showQuickPick([choose, detect], { title: area.label })
    : choose;
  if (action === detect) {
    const rest = Object.fromEntries(Object.entries(current).filter(([id]) => id !== area.id));
    await config.update(
      'roots',
      Object.keys(rest).length > 0 ? rest : undefined,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    return;
  }
  if (action !== choose) {
    return;
  }

  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    defaultUri: folder.uri,
    title: area.label,
    openLabel: vscode.l10n.t('Use as Translation Folders'),
  });
  if (!uris || uris.length === 0) {
    return;
  }
  // The dialog returns the casing on disk; the workspace folder keeps the casing it was opened with.
  const ignoreCase = process.platform === 'win32' || process.platform === 'darwin';
  const roots = uris.map((uri) => relativeUriPath(folder.uri.path, uri.path, ignoreCase));
  if (roots.some((root) => root === undefined)) {
    await showError(vscode.l10n.t('Choose folders inside {0}.', folder.name));
    return;
  }
  await config.update('roots', { ...current, [area.id]: roots }, vscode.ConfigurationTarget.WorkspaceFolder);
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length <= 1) {
    return folders[0];
  }
  return vscode.window.showWorkspaceFolderPick({
    placeHolder: vscode.l10n.t('Workspace folder of the translations'),
  });
}

async function pickArea(areas: readonly AreaDefinition[]): Promise<AreaDefinition | undefined> {
  if (areas.length <= 1) {
    return areas[0];
  }
  const picked = await vscode.window.showQuickPick(
    areas.map((area) => ({ label: area.label, description: area.id, area })),
    { placeHolder: vscode.l10n.t('Area whose folders you want to set') },
  );
  return picked?.area;
}
