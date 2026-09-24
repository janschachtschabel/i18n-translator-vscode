import * as vscode from 'vscode';
import { AreasTreeProvider } from './views/areasTree';

export function activate(context: vscode.ExtensionContext): void {
  const notYetAvailable = () =>
    vscode.window.showInformationMessage(vscode.l10n.t('No translation files have been indexed yet.'));

  context.subscriptions.push(
    vscode.window.createTreeView('eduI18n.areas', { treeDataProvider: new AreasTreeProvider() }),
    vscode.commands.registerCommand('eduI18n.check', notYetAvailable),
    vscode.commands.registerCommand('eduI18n.configureRoots', notYetAvailable),
  );
}
