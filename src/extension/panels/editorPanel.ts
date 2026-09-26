import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { parseBundleId } from '../../core/model/bundle';
import {
  copyUiState,
  copyUnsavedTexts,
  DEFAULT_UI_STATE,
  isUiState,
  isUnsavedTexts,
  isWebviewToHost,
  readableEditRequestId,
  type EditorCommand,
  type HostToWebview,
  type PanelState,
  type UiState,
  type UnsavedText,
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
  /** Shows the mail of the key's template beside the editor. */
  preview: (target: PanelState, entryId: string) => void;
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
        // Kept per bundle like the view state, so that closing the editor or reloading the window loses no text.
        unsaved: async ({ texts }) => {
          await this.services.workspaceState.update(
            this.unsavedKey(),
            texts.length > 0 ? copyUnsavedTexts(texts) : undefined,
          );
        },
        undo: () => undoFromEditor(this.target, this.services),
        command: ({ command, entryId }) => this.services.command(command, this.target, entryId),
        preview: ({ entryId }) => this.services.preview(this.target, entryId),
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
      unsaved: this.storedUnsaved(),
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
    // An editor that closed meanwhile (e.g. while `init` was on its way) shows nothing: its title would throw.
    if (this.disposed) {
      return Promise.resolve();
    }
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
      ...(found.root.analysis.area.placeholderSyntax
        ? { placeholderSyntax: found.root.analysis.area.placeholderSyntax }
        : {}),
      localize,
    });
    const before = this.sent;
    this.sent = model;
    const name = found.bundle.name;
    // A patch carries neither the placeholder syntax nor the mail preview; they change only with the area settings,
    // then the whole model goes.
    if (
      !before ||
      before.placeholderSyntax !== model.placeholderSyntax ||
      before.mailPreview !== model.mailPreview
    ) {
      this.services.log.debug(
        `Built the model of ${name} (${model.rows.length} keys) in ${Date.now() - started} ms.`,
      );
      return this.post({ type: 'bundle', model });
    }
    const patch = diffModels(before, model);
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

  /** The texts of the bundle that were not saved when its editor was last used; unreadable ones are left out. */
  private storedUnsaved(): UnsavedText[] {
    const stored = this.services.workspaceState.get<unknown>(this.unsavedKey());
    return isUnsavedTexts(stored) ? copyUnsavedTexts(stored) : [];
  }

  private unsavedKey(): string {
    return `eduI18n.unsaved:${JSON.stringify([this.target.folder, this.target.bundleId])}`;
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
