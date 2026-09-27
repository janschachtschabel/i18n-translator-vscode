import * as vscode from 'vscode';
import { selectModel, testAiConnection } from './commands/aiConnection';
import { clearApiKey, setApiKey } from './commands/apiKey';
import { backUpNow, restoreBackup } from './commands/backup';
import { checkTranslations } from './commands/check';
import { configureRoots } from './commands/configureRoots';
import { registerKeyCommands, runEditorCommand } from './commands/keyCommands';
import { openBundle } from './commands/openBundle';
import { previewMail } from './commands/previewMail';
import { vscodePrompts } from './commands/prompts';
import { undoLastChange } from './commands/undoLastChange';
import { DiagnosticsPublisher } from './diagnostics/diagnosticsPublisher';
import { EditorPanels } from './panels/editorPanels';
import { MailPreview } from './panels/mailPreview';
import { AiConsent } from './services/aiConsent';
import { AiService } from './services/aiService';
import { ApiKeyStore } from './services/apiKeyStore';
import { BackupService } from './services/backupService';
import { FileStore } from './services/fileStore';
import { WorkspaceIndex } from './services/workspaceIndex';
import { createAreasView, type AreaNode, type AreasTreeProvider } from './views/areasTree';
import type { IssueDecorations } from './views/decorations';
import { IndexStatusBar } from './views/statusBar';

/**
 * Returned by `activate` in the integration tests only, which reach the index and read what the views show through
 * it. Other extensions get nothing: through it they could write files without the user's confirmations.
 */
export interface ExtensionApi {
  index: WorkspaceIndex;
  fileStore: FileStore;
  editors: EditorPanels;
  mailPreview: MailPreview;
  ai: { keys: ApiKeyStore; service: AiService; consent: AiConsent };
  views: {
    areas: AreasTreeProvider;
    areasView: vscode.TreeView<AreaNode>;
    decorations: IssueDecorations;
    statusBar: vscode.StatusBarItem;
  };
}

export function activate(context: vscode.ExtensionContext): ExtensionApi | undefined {
  const log = vscode.window.createOutputChannel('edu-sharing i18n', { log: true });
  const index = new WorkspaceIndex(log);
  const backups = new BackupService(context.storageUri, index, log);
  const fileStore = new FileStore(index, log, {
    beforeWrite: (kind, files) => backups.beforeWrite(kind, files),
  });
  const keyContext = { index, fileStore, prompts: vscodePrompts };
  const keys = new ApiKeyStore(context.secrets);
  // "Remove API Key" is offered while there is a stored key to remove (the context key of the command palette).
  const keyStored = async () =>
    vscode.commands.executeCommand('setContext', 'eduI18n.aiKeyStored', (await keys.source()) === 'secret');
  void keyStored();
  const ai = new AiService(keys, log);
  const consent = new AiConsent(context.globalState);
  const mailPreview = new MailPreview(index, log);
  const editors = new EditorPanels({
    extensionUri: context.extensionUri,
    workspaceState: context.workspaceState,
    index,
    fileStore,
    log,
    prompts: vscodePrompts,
    command: (command, target, entryId) => runEditorCommand(keyContext, command, target, entryId),
    preview: (target, entryId) => mailPreview.show(target, entryId),
    ai,
    consent,
  });
  const areas = createAreasView(index);
  const statusBar = new IndexStatusBar(index);

  context.subscriptions.push(
    log,
    index,
    new DiagnosticsPublisher(index),
    editors,
    mailPreview,
    areas.disposable,
    statusBar,
    ai,
    keys.onDidChange(() => void keyStored()),
    vscode.commands.registerCommand('eduI18n.check', () => checkTranslations(index)),
    vscode.commands.registerCommand('eduI18n.configureRoots', () => configureRoots()),
    // Returns nothing: VS Code would send a result to the workbench on every click in the tree.
    vscode.commands.registerCommand('eduI18n.openBundle', (node?: unknown) => void openBundle(editors, node)),
    vscode.commands.registerCommand('eduI18n.backupNow', () => backUpNow(backups, fileStore, log)),
    vscode.commands.registerCommand('eduI18n.restoreBackup', () => restoreBackup(backups, fileStore, log)),
    vscode.commands.registerCommand('eduI18n.undoLastChange', () => undoLastChange(fileStore)),
    vscode.commands.registerCommand('eduI18n.previewMail', (arg?: unknown) =>
      previewMail(arg, { ...keyContext, editors }, mailPreview),
    ),
    ...registerKeyCommands({ ...keyContext, editors }),
    vscode.commands.registerCommand('eduI18n.setApiKey', () => setApiKey({ keys, prompts: vscodePrompts })),
    vscode.commands.registerCommand('eduI18n.clearApiKey', () =>
      clearApiKey({ keys, prompts: vscodePrompts }),
    ),
    vscode.commands.registerCommand('eduI18n.testAiConnection', () => testAiConnection(ai, log)),
    vscode.commands.registerCommand('eduI18n.selectModel', () => selectModel(ai, vscodePrompts, log)),
  );
  // Not awaited: activation stays fast, and the views update when the first run completes.
  index.refresh().catch((error: unknown) => log.error('Indexing failed.', error));
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    return undefined;
  }
  return {
    index,
    fileStore,
    editors,
    mailPreview,
    ai: { keys, service: ai, consent },
    views: {
      areas: areas.provider,
      areasView: areas.view,
      decorations: areas.decorations,
      statusBar: statusBar.item,
    },
  };
}
