import * as vscode from 'vscode';
import type { HostToWebview, PanelState } from '../../shared/protocol';
import type { Prompts } from '../commands/prompts';
import type { AiConsent } from '../services/aiConsent';
import type { AiService } from '../services/aiService';
import { messageOf } from '../services/errors';
import type { WorkspaceIndex } from '../services/workspaceIndex';
import { suggestCellText } from './suggestCell';

/** What the AI part of an editor needs from the extension. */
export interface AiPanelServices {
  ai: AiService;
  consent: AiConsent;
  index: WorkspaceIndex;
  prompts: Prompts;
  log: vscode.LogOutputChannel;
}

/**
 * The AI part of one editor: tells the webview whether the AI can be used, and answers its requests for
 * suggestions; a request the webview cancels, or that of an editor that closes, is aborted.
 */
export class AiPanel implements vscode.Disposable {
  private readonly pending = new Map<string, AbortController>();
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly target: PanelState,
    private readonly services: AiPanelServices,
    private readonly post: (message: HostToWebview) => Promise<void>,
  ) {
    this.subscription = services.ai.onDidChange(() => void this.sendState());
  }

  async sendState(): Promise<void> {
    const { available, reason, settings } = await this.services.ai.status();
    await this.post({ type: 'aiState', available, ...(reason ? { reason } : {}), model: settings.model });
  }

  /** Answers a request for a suggestion; whatever happens, the editor gets an answer and waits no longer. */
  async suggest(request: { requestId: string; entryId: string; locale: string }): Promise<void> {
    try {
      await this.answer(request);
    } catch (error) {
      this.services.log.error('A suggestion failed.', error);
      await this.post({
        type: 'aiSuggestion',
        requestId: request.requestId,
        message: vscode.l10n.t('The suggestion failed: {error}', { error: messageOf(error) }),
      });
    }
  }

  private async answer({
    requestId,
    entryId,
    locale,
  }: {
    requestId: string;
    entryId: string;
    locale: string;
  }) {
    const { ai, consent, index, prompts, log } = this.services;
    const { available, host } = await ai.status();
    if (available && !(await consent.ensure(host, prompts))) {
      await this.post({
        type: 'aiSuggestion',
        requestId,
        message: vscode.l10n.t('No texts were sent: the AI needs your consent first.'),
      });
      return;
    }
    const controller = new AbortController();
    this.pending.set(requestId, controller);
    try {
      const result = await suggestCellText(
        ai,
        await index.latest(),
        this.target,
        { entryId, locale },
        log,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        await this.post({ type: 'aiSuggestion', requestId, ...result });
      }
    } finally {
      this.pending.delete(requestId);
    }
  }

  cancel({ requestId }: { requestId: string }): void {
    this.pending.get(requestId)?.abort();
  }

  setup(): void {
    void vscode.commands.executeCommand('eduI18n.setApiKey');
  }

  dispose(): void {
    this.pending.forEach((controller) => controller.abort());
    this.subscription.dispose();
  }
}
