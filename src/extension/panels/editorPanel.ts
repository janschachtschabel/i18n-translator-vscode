import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { parseBundleId, type Bundle } from '../../core/model/bundle';
import {
  copyPanelState,
  copyUiState,
  DEFAULT_UI_STATE,
  isPanelState,
  isUiState,
  isWebviewToHost,
  readableEditRequestId,
  type HostToWebview,
  type PanelState,
  type UiState,
} from '../../shared/protocol';
import { buildBundleViewModel } from '../../shared/viewModel';
import { localize } from '../localize';
import type { FileStore } from '../services/fileStore';
import type { IndexedRoot, IndexSnapshot, WorkspaceIndex } from '../services/workspaceIndex';
import { findBundle } from './bundleTarget';
import { applyEdit } from './editHandler';
import { routeMessage } from './messageRouter';
import { pageLanguage, webviewHtml } from './webviewHtml';

export const EDITOR_VIEW_TYPE = 'eduI18n.editor';

/** What the editors need from the extension. */
export interface EditorServices {
  extensionUri: vscode.Uri;
  /** Keeps the view state of each bundle (B7). */
  workspaceState: vscode.Memento;
  index: WorkspaceIndex;
  /** Writes the edits (B1). */
  fileStore: FileStore;
  log: vscode.LogOutputChannel;
  /** Undoes the last change to the translation files and tells the user how it went. */
  undo: () => Promise<void>;
}

/** The editors of the bundles: one per bundle, restored after a restart, updated after every index run. */
export class EditorPanels implements vscode.Disposable {
  private readonly panels = new Set<EditorPanel>();
  private readonly subscriptions: vscode.Disposable[];

  constructor(private readonly services: EditorServices) {
    this.subscriptions = [
      services.index.onDidChange((snapshot) => {
        for (const panel of this.panels) {
          panel
            .update(snapshot)
            .catch((error: unknown) => services.log.error('Could not update an editor.', error));
        }
      }),
      vscode.window.registerWebviewPanelSerializer(EDITOR_VIEW_TYPE, {
        deserializeWebviewPanel: async (panel, state) => void this.restore(panel, state),
      }),
    ];
  }

  /** Shows the editor of a bundle; if it is open, it comes to the front. */
  open(root: IndexedRoot, bundle: Bundle): EditorPanel {
    const target: PanelState = { folder: root.folder.uri.toString(), bundleId: bundle.id };
    const open = this.find(target);
    if (open) {
      open.panel.reveal();
      return open;
    }
    const panel = vscode.window.createWebviewPanel(EDITOR_VIEW_TYPE, bundle.name, vscode.ViewColumn.Active, {
      retainContextWhenHidden: true,
    });
    return this.add(panel, target);
  }

  /**
   * Takes over a panel VS Code restored after a restart. One whose state is not readable is closed, and so is one
   * whose bundle got its editor meanwhile: VS Code restores a tab only when it is first shown, which may be
   * after the bundle was opened from the tree.
   */
  restore(panel: vscode.WebviewPanel, state: unknown): EditorPanel | undefined {
    if (!isPanelState(state)) {
      this.services.log.warn('Closed a restored editor whose saved state is not readable.');
      panel.dispose();
      return undefined;
    }
    const open = this.find(state);
    if (open) {
      panel.dispose();
      open.panel.reveal();
      return open;
    }
    return this.add(panel, copyPanelState(state));
  }

  /** Leaves the panels open: VS Code restores them in the next session. */
  dispose(): void {
    for (const panel of this.panels) {
      panel.dispose();
    }
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private find(target: PanelState): EditorPanel | undefined {
    return [...this.panels].find(
      (panel) => panel.target.folder === target.folder && panel.target.bundleId === target.bundleId,
    );
  }

  private add(panel: vscode.WebviewPanel, target: PanelState): EditorPanel {
    const editor = new EditorPanel(panel, target, this.services);
    this.panels.add(editor);
    panel.onDidDispose(() => {
      this.panels.delete(editor);
      editor.dispose();
    });
    return editor;
  }
}

/** The editor of one bundle: its webview panel and the conversation with the webview. */
export class EditorPanel implements vscode.Disposable {
  private readonly posted = new vscode.EventEmitter<HostToWebview>();
  /** Fires for every message to the webview; the integration tests follow the conversation with it. */
  readonly onDidPost = this.posted.event;
  private readonly subscriptions: vscode.Disposable[];
  /** Whether the webview has asked for its content; messages sent before would get lost. */
  private started = false;

  constructor(
    readonly panel: vscode.WebviewPanel,
    readonly target: PanelState,
    private readonly services: EditorServices,
  ) {
    const { name } = parseBundleId(target.bundleId);
    const files = vscode.Uri.joinPath(services.extensionUri, 'dist', 'webview');
    panel.title = name;
    panel.webview.options = { enableScripts: true, localResourceRoots: [files] };
    panel.webview.html = webviewHtml({
      cspSource: panel.webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(files, 'main.js')).toString(),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(files, 'main.css')).toString(),
      language: pageLanguage(vscode.env.language, vscode.l10n.bundle),
      title: name,
    });
    this.subscriptions = [
      this.posted,
      panel.webview.onDidReceiveMessage((message: unknown) => this.receive(message)),
    ];
  }

  /** Handles a message from the webview; anything invalid is logged and dropped. */
  async receive(message: unknown): Promise<void> {
    await routeMessage(
      message,
      {
        ready: () => this.start(),
        edit: async (request) => {
          const answer = await applyEdit(request, this.target, this.services);
          await this.post({ type: 'writeResult', requestId: request.requestId, ...answer });
        },
        uiState: async ({ state }) => {
          await this.services.workspaceState.update(this.stateKey(), copyUiState(state));
        },
        undo: () => this.services.undo(),
      },
      this.services.log,
    );
    // The router dropped an edit it could not read; its cell still gets an answer, so that it does not wait.
    const requestId = isWebviewToHost(message) ? undefined : readableEditRequestId(message);
    if (requestId !== undefined) {
      await this.post({
        type: 'writeResult',
        requestId,
        ok: false,
        message: vscode.l10n.t('The change could not be read; nothing was written.'),
      });
    }
  }

  /** Shows the bundle as an index run found it, or that it is gone. */
  async update(snapshot: IndexSnapshot): Promise<void> {
    if (this.started) {
      await this.show(snapshot);
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  /** Answers `ready`, which the webview sends whenever it (re)loads. */
  private async start(): Promise<void> {
    this.started = true;
    await this.post({
      type: 'init',
      l10n: vscode.l10n.bundle ?? {},
      uiState: this.storedUiState(),
      panelState: this.target,
    });
    // Before the first index run (a panel restored at startup), `update` brings the bundle.
    const snapshot = this.services.index.current();
    if (snapshot) {
      await this.show(snapshot);
    }
  }

  private show(snapshot: IndexSnapshot): Promise<void> {
    const found = findBundle(snapshot, this.target);
    return this.post(
      found
        ? {
            type: 'bundle',
            model: buildBundleViewModel(found.bundle, {
              issues: found.root.analysis.issues,
              variants: Object.keys(found.root.settings.variants),
              baseFileLanguage: found.root.settings.baseFileLanguage,
              localize,
            }),
          }
        : { type: 'missing', name: parseBundleId(this.target.bundleId).name },
    );
  }

  /** The view state the bundle had when its editor was last used; a state of an older version is ignored. */
  private storedUiState(): UiState {
    const stored = this.services.workspaceState.get<unknown>(this.stateKey());
    return isUiState(stored) ? copyUiState(stored) : DEFAULT_UI_STATE;
  }

  private stateKey(): string {
    return `eduI18n.view:${JSON.stringify([this.target.folder, this.target.bundleId])}`;
  }

  private async post(message: HostToWebview): Promise<void> {
    this.posted.fire(message);
    await this.panel.webview.postMessage(message);
  }
}
