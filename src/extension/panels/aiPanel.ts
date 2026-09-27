import * as vscode from 'vscode';
import type { AiApplyItem } from '../../shared/aiProtocol';
import type { HostToWebview, PanelState } from '../../shared/protocol';
import { unavailableMessage } from '../services/aiFeedback';
import { showFailure } from '../notify';
import { messageOf } from '../services/errors';
import { CHECK } from './aiCheck';
import { FILL } from './aiFill';
import { AiJobs } from './aiJobs';
import type { AiPanelServices } from './aiPanelServices';
import { requestSuggestion, suggestionRequest } from './suggestCell';

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

  /**
   * Answers a request for a suggestion; whatever happens, the editor gets an answer and waits no longer. A request it
   * cancelled (or one of a page that reloaded) sends nothing and gets no answer.
   */
  async suggest({ requestId, entryId, locale }: { requestId: string; entryId: string; locale: string }) {
    const { ai, consent, index, prompts, log } = this.services;
    // Cancellable from the start: a cancel may come while the settings are read or the consent is asked, before
    // anything is sent.
    const controller = new AbortController();
    // One suggestion on its way per editor: the webview asks for one at a time, and a page that asks for more must not
    // spend the key on them (audit S-15). A new request cancels the one before.
    this.pending.forEach((other) => other.abort());
    this.pending.clear();
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
      // Nothing to send: no reason to ask for the consent. Nor for a request cancelled meanwhile.
      if ('message' in request) {
        await reply(request);
        return;
      }
      if (controller.signal.aborted) {
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
    } catch (error) {
      log.error('A suggestion failed.', error);
      await reply({ message: vscode.l10n.t('The suggestion failed: {error}', { error: messageOf(error) }) });
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
    vscode.commands.executeCommand('eduI18n.setApiKey').then(undefined, showFailure);
  }

  /** The setup of the AI in one place (setUpAi). */
  configure(): void {
    vscode.commands.executeCommand('eduI18n.setupAi').then(undefined, showFailure);
  }

  dispose(): void {
    this.pending.forEach((controller) => controller.abort());
    this.jobs.abort();
    this.subscription.dispose();
  }
}
