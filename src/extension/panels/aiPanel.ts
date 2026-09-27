import * as vscode from 'vscode';
import type { AiApplyItem } from '../../shared/aiProtocol';
import type { HostToWebview, PanelState } from '../../shared/protocol';
import type { Prompts } from '../commands/prompts';
import type { AiConsent } from '../services/aiConsent';
import { unavailableMessage } from '../services/aiFeedback';
import type { AiService } from '../services/aiService';
import { messageOf } from '../services/errors';
import type { FileStore } from '../services/fileStore';
import type { WorkspaceIndex } from '../services/workspaceIndex';
import { CHECK } from './aiCheck';
import { FILL } from './aiFill';
import { AiJobs } from './aiJobs';
import { requestSuggestion, suggestionRequest } from './suggestCell';

/** What the AI part of an editor needs from the extension. */
export interface AiPanelServices {
  ai: AiService;
  consent: AiConsent;
  index: WorkspaceIndex;
  fileStore: FileStore;
  prompts: Prompts;
  log: vscode.LogOutputChannel;
}

/**
 * The AI part of one editor: tells the webview whether the AI can be used, answers its requests for suggestions,
 * and runs its jobs (AiJobs); a request the webview cancels, or that of an editor that closes, is aborted.
 */
export class AiPanel implements vscode.Disposable {
  /** The suggestions on their way, by request id. */
  private readonly pending = new Map<string, AbortController>();
  private readonly jobs: AiJobs;
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly target: PanelState,
    private readonly services: AiPanelServices,
    private readonly post: (message: HostToWebview) => Promise<void>,
  ) {
    this.jobs = new AiJobs(target, services, post);
    this.subscription = services.ai.onDidChange(() => void this.sendState());
  }

  /** Tells the webview whether the AI can be used; a failure to find out is logged, the editor works without it. */
  async sendState(): Promise<void> {
    try {
      const { available, reason, settings } = await this.services.ai.status();
      await this.post({ type: 'aiState', available, ...(reason ? { reason } : {}), model: settings.model });
    } catch (error) {
      this.services.log.error('Finding out whether the AI can be used failed.', error);
    }
  }

  /**
   * The webview (re)loaded: its requests went with the page before, whose ids the new page may use again, and no
   * page shows the fill that runs. All are cancelled.
   */
  pageLoaded(): void {
    this.pending.forEach((controller) => controller.abort());
    this.pending.clear();
    this.jobs.abort();
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
    // Cancellable from the start: a cancel (or a reload of the page) may come while the settings are read or the
    // consent is asked, before anything is sent. A cancelled request sends nothing and gets no answer.
    const controller = new AbortController();
    this.pending.get(requestId)?.abort();
    this.pending.set(requestId, controller);
    const reply = async (answer: { text: string } | { message: string }) => {
      if (!controller.signal.aborted) {
        await this.post({ type: 'aiSuggestion', requestId, ...answer });
      }
    };
    try {
      // One reading of the settings for the checks, the consent and the request: the texts go to the host asked
      // about.
      const client = await ai.client();
      if (!client) {
        await reply({ message: unavailableMessage((await ai.status()).reason ?? 'no-key') });
        return;
      }
      const request = suggestionRequest(
        await index.latest(),
        this.target,
        { entryId, locale },
        client.status.settings,
      );
      // Nothing to send: no reason to ask for the consent.
      if ('message' in request) {
        await reply(request);
        return;
      }
      if (!(await consent.ensure(client.status.host, prompts))) {
        await reply({ message: vscode.l10n.t('No texts were sent: the AI needs your consent first.') });
        return;
      }
      if (controller.signal.aborted) {
        return;
      }
      await reply(await requestSuggestion(client, request, log, controller.signal));
    } finally {
      // A request of a reloaded page may have taken the id meanwhile.
      if (this.pending.get(requestId) === controller) {
        this.pending.delete(requestId);
      }
    }
  }

  /** Fills a language of the bundle with AI, through the review list. */
  fill(): Promise<void> {
    return this.jobs.run(FILL);
  }

  /** Checks the translations of a language of the bundle with AI, through the review list. */
  check(): Promise<void> {
    return this.jobs.run(CHECK);
  }

  /** Writes reviewed texts of the last job as one change. */
  apply(request: { requestId: string; jobId: string; items: AiApplyItem[] }): Promise<void> {
    return this.jobs.apply(request);
  }

  /** Cancels a suggestion or a job, by its id. */
  cancel({ requestId }: { requestId: string }): void {
    this.pending.get(requestId)?.abort();
    this.jobs.cancel(requestId);
  }

  setup(): void {
    void vscode.commands.executeCommand('eduI18n.setApiKey');
  }

  /** The setup of the AI in one place (setUpAi). */
  configure(): void {
    void vscode.commands.executeCommand('eduI18n.setupAi');
  }

  dispose(): void {
    this.pending.forEach((controller) => controller.abort());
    this.jobs.abort();
    this.subscription.dispose();
  }
}
