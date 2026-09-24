import * as vscode from 'vscode';
import { DiagnosticsPublisher } from './diagnostics/diagnosticsPublisher';
import { WorkspaceIndex } from './services/workspaceIndex';
import { createAreasView, type AreasTreeProvider } from './views/areasTree';

/** Returned by `activate`; the integration tests reach the index and the views through it. */
export interface ExtensionApi {
  index: WorkspaceIndex;
  areas: AreasTreeProvider;
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const log = vscode.window.createOutputChannel('edu-sharing i18n', { log: true });
  const index = new WorkspaceIndex(log);
  const areas = createAreasView(index);
  const notYetAvailable = () =>
    vscode.window.showInformationMessage(vscode.l10n.t('No translation files have been indexed yet.'));

  context.subscriptions.push(
    log,
    index,
    new DiagnosticsPublisher(index),
    areas.disposable,
    vscode.commands.registerCommand('eduI18n.check', notYetAvailable),
    vscode.commands.registerCommand('eduI18n.configureRoots', notYetAvailable),
  );
  // Not awaited: activation stays fast, and the views update when the first run completes.
  index.refresh().catch((error: unknown) => log.error('Indexing failed.', error));
  return { index, areas: areas.provider };
}
