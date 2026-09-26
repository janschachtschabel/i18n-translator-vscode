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
  type EditorCommand,
  type HostToWebview,
  type PanelState,
  type UiState,
} from '../../shared/protocol';
import { diffModels } from '../../shared/patch';
import { buildBundleViewModel, type BundleViewModel } from '../../shared/viewModel';
import type { Prompts } from '../commands/prompts';
import { localize } from '../localize';
import { messageOf } from '../services/errors';
import type { FileStore } from '../services/fileStore';
import type { IndexedRoot, IndexSnapshot, WorkspaceIndex } from '../services/workspaceIndex';
import { editorTitle } from './editorTitle';
import { findBundle } from './findBundle';
import { applyEdit, type EditAnswer, type EditRequest } from './editHandler';
import { routeMessage } from './messageRouter';
import { undoFromEditor } from './undoHandler';
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
  /** Asks before a text is cleared (B2). */
  prompts: Prompts;
  log: vscode.LogOutputChannel;
  /** Runs a key or language command on the editor's bundle, starting from the key it names. */
  command: (command: EditorCommand, target: PanelState, entryId: string | undefined) => Promise<void>;
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

  /** The editor in front, e.g. the one whose context menu was opened. */
  active(): EditorPanel | undefined {
    return [...this.panels].find((editor) => editor.panel.active);
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
  private disposed = false;
  /** Fires for every message to the webview; the integration tests follow the conversation with it. */
  readonly onDidPost = this.posted.event;
  private readonly subscriptions: vscode.Disposable[];
  /** Whether the webview has asked for its content; messages sent before would get lost. */
  private started = false;
  /** The model the webview has, with the patches sent since; undefined while it has none. */
  private sent: BundleViewModel | undefined;
  /** The root the model was built from: a run of another root leaves it, and the bundle, as they are. */
  private sentRoot: IndexedRoot | undefined;

  constructor(
    readonly panel: vscode.WebviewPanel,
    readonly target: PanelState,
    private readonly services: EditorServices,
  ) {
    const title = editorTitle(services.index.current(), target);
    const files = vscode.Uri.joinPath(services.extensionUri, 'dist', 'webview');
    panel.title = title;
    panel.webview.options = { enableScripts: true, localResourceRoots: [files] };
    panel.webview.html = webviewHtml({
      cspSource: panel.webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(files, 'main.js')).toString(),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(files, 'main.css')).toString(),
      language: pageLanguage(vscode.env.language, vscode.l10n.bundle),
      title,
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
          await this.post({
            type: 'writeResult',
            requestId: request.requestId,
            ...(await this.save(request)),
          });
        },
        uiState: async ({ state }) => {
          await this.services.workspaceState.update(this.stateKey(), copyUiState(state));
        },
        undo: () => undoFromEditor(this.target, this.services),
        command: ({ command, entryId }) => this.services.command(command, this.target, entryId),
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

  /** Writes an edit; whatever happens, its cell gets an answer, so that it never waits for one. */
  private async save(request: EditRequest): Promise<EditAnswer> {
    try {
      return await applyEdit(request, this.target, this.services);
    } catch (error) {
      this.services.log.error('Saving a text from the editor failed.', error);
      return {
        ok: false,
        message: vscode.l10n.t('The change could not be saved: {error}', { error: messageOf(error) }),
      };
    }
  }

  /** Shows the bundle as an index run found it, or that it is gone. */
  async update(snapshot: IndexSnapshot): Promise<void> {
    if (this.started) {
      await this.show(snapshot);
    }
  }

  dispose(): void {
    this.disposed = true;
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  /** Answers `ready`, which the webview sends whenever it (re)loads. */
  private async start(): Promise<void> {
    this.started = true;
    this.sent = undefined;
    this.sentRoot = undefined;
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

  /**
   * The bundle as an index run found it: the whole model the first time, then what changed (a run of the root
   * may have changed another bundle, then this one gets nothing), or that it is gone.
   */
  private show(snapshot: IndexSnapshot): Promise<void> {
    // Roots may come and go, e.g. with a second checkout: the title names the root while there are several.
    this.panel.title = editorTitle(snapshot, this.target);
    const found = findBundle(snapshot, this.target);
    if (!found) {
      this.sent = undefined;
      this.sentRoot = undefined;
      return this.post({ type: 'missing', name: parseBundleId(this.target.bundleId).name });
    }
    if (this.sent && found.root === this.sentRoot) {
      return Promise.resolve();
    }
    this.sentRoot = found.root;
    const started = Date.now();
    const model = buildBundleViewModel(found.bundle, {
      issues: found.root.analysis.issues,
      variants: Object.keys(found.root.settings.variants),
      baseFileLanguage: found.root.settings.baseFileLanguage,
      localize,
    });
    const before = this.sent;
    this.sent = model;
    const patch = before && diffModels(before, model);
    const name = found.bundle.name;
    if (!before) {
      this.services.log.debug(
        `Built the model of ${name} (${model.rows.length} keys) in ${Date.now() - started} ms.`,
      );
      return this.post({ type: 'bundle', model });
    }
    if (!patch) {
      return Promise.resolve();
    }
    this.services.log.debug(
      `Built a patch of ${name} (${patch.rows.length} rows) in ${Date.now() - started} ms.`,
    );
    return this.post({ type: 'patch', patch });
  }

  /** The view state the bundle had when its editor was last used; a state of an older version is ignored. */
  private storedUiState(): UiState {
    const stored = this.services.workspaceState.get<unknown>(this.stateKey());
    return isUiState(stored) ? copyUiState(stored) : DEFAULT_UI_STATE;
  }

  private stateKey(): string {
    return `eduI18n.view:${JSON.stringify([this.target.folder, this.target.bundleId])}`;
  }

  /** Sends a message to the webview; an editor that closed meanwhile (e.g. during a save) gets nothing. */
  private async post(message: HostToWebview): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.posted.fire(message);
    await this.panel.webview.postMessage(message);
  }
}
