import * as vscode from 'vscode';
import { checkTranslations } from './commands/check';
import { configureRoots } from './commands/configureRoots';
import { DiagnosticsPublisher } from './diagnostics/diagnosticsPublisher';
import { WorkspaceIndex } from './services/workspaceIndex';
import { createAreasView, type AreaNode, type AreasTreeProvider } from './views/areasTree';
import type { IssueDecorations } from './views/decorations';
import { IndexStatusBar } from './views/statusBar';

/** Returned by `activate`; the integration tests reach the index and read what the views show through it. */
export interface ExtensionApi {
  index: WorkspaceIndex;
  views: {
    areas: AreasTreeProvider;
    areasView: vscode.TreeView<AreaNode>;
    decorations: IssueDecorations;
    statusBar: vscode.StatusBarItem;
  };
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const log = vscode.window.createOutputChannel('edu-sharing i18n', { log: true });
  const index = new WorkspaceIndex(log);
  const areas = createAreasView(index);
  const statusBar = new IndexStatusBar(index);

  context.subscriptions.push(
    log,
    index,
    new DiagnosticsPublisher(index),
    areas.disposable,
    statusBar,
    vscode.commands.registerCommand('eduI18n.check', () => checkTranslations(index)),
    vscode.commands.registerCommand('eduI18n.configureRoots', () => configureRoots()),
  );
  // Not awaited: activation stays fast, and the views update when the first run completes.
  index.refresh().catch((error: unknown) => log.error('Indexing failed.', error));
  return {
    index,
    views: {
      areas: areas.provider,
      areasView: areas.view,
      decorations: areas.decorations,
      statusBar: statusBar.item,
    },
  };
}
