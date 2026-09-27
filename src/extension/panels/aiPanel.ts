import * as vscode from 'vscode';
import type { AiApplyItem } from '../../shared/aiProtocol';
import type { HostToWebview, PanelState } from '../../shared/protocol';
import type { Prompts } from '../commands/prompts';
import { showInfo } from '../notify';
import type { AiConsent } from '../services/aiConsent';
import { aiFailureMessage, explainUnavailable } from '../services/aiFeedback';
import type { AiService } from '../services/aiService';
import { messageOf } from '../services/errors';
import type { FileStore } from '../services/fileStore';
import type { WorkspaceIndex } from '../services/workspaceIndex';
import { applyFill, fillChoices, fillQuestion, runFill } from './aiFill';
import { findBundle } from './findBundle';
import { suggestCellText } from './suggestCell';

/** A fill ask for a confirmation from this many requests on. */
const CONFIRM_REQUESTS = 5;

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
 * The AI part of one editor: tells the webview whether the AI can be used, and answers its requests for
 * suggestions; a request the webview cancels, or that of an editor that closes, is aborted.
 */
export class AiPanel implements vscode.Disposable {
  private readonly pending = new Map<string, AbortController>();
  private readonly subscription: vscode.Disposable;
  /** The last fill: its texts may be written until the next one begins. */
  private job: { id: string; locale: string; entries: ReadonlySet<string> } | undefined;
  private jobs = 0;

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

  /**
   * Fills a language of the bundle: asks which (with its number of texts), confirms a fill of many requests and the
   * consent, then sends the suggestions to the review list as they come. One fill at a time per editor.
   */
  async fill(): Promise<void> {
    const { ai, consent, index, prompts, log } = this.services;
    if (this.job && this.pending.has(this.job.id)) {
      void showInfo(vscode.l10n.t('A fill of this bundle is running; cancel it or wait until it ends.'));
      return;
    }
    const client = await ai.client();
    if (!client) {
      void explainUnavailable((await ai.status()).reason ?? 'no-key');
      return;
    }
    const found = findBundle(await index.latest(), this.target);
    if (!found) {
      return;
    }
    const choices = fillChoices(found.bundle, found.root);
    if (choices.length === 0) {
      void showInfo(
        vscode.l10n.t('{bundle} has no missing or empty texts to fill.', { bundle: found.bundle.name }),
      );
      return;
    }
    const choice = await prompts.pick(
      choices.map((candidate) => ({
        label: candidate.locale,
        description: vscode.l10n.t('{count} texts', { count: String(candidate.entries.length) }),
        value: candidate,
      })),
      vscode.l10n.t('The language to fill with AI'),
    );
    if (!choice) {
      return;
    }
    const { status } = client;
    const requests = Math.ceil(choice.entries.length / status.settings.batchSize);
    if (
      requests >= CONFIRM_REQUESTS &&
      !(await prompts.confirm(fillQuestion(found.bundle, choice, status, requests), vscode.l10n.t('Fill')))
    ) {
      return;
    }
    if (!(await consent.ensure(status.host, prompts))) {
      return;
    }
    const jobId = `fill-${++this.jobs}`;
    const controller = new AbortController();
    this.pending.set(jobId, controller);
    this.job = {
      id: jobId,
      locale: choice.locale,
      entries: new Set(choice.entries.map((entry) => entry.entryId)),
    };
    await this.post({
      type: 'aiJob',
      jobId,
      kind: 'fill',
      locale: choice.locale,
      source: choice.source,
      total: choice.entries.length,
    });
    const started = Date.now();
    try {
      const result = await runFill({
        client: client.options,
        status,
        bundle: found.bundle,
        root: found.root,
        choice,
        signal: controller.signal,
        onItems: (items, done, total) => void this.post({ type: 'aiJobItems', jobId, items, done, total }),
      });
      const message = result.status === 'failed' ? aiFailureMessage(result.error, status) : undefined;
      log.info(
        `Filled ${found.bundle.name} in ${choice.locale}: ${result.status}, ${choice.entries.length - result.missing.length} of ${choice.entries.length} texts in ${Date.now() - started} ms.`,
      );
      await this.post({
        type: 'aiJobEnd',
        jobId,
        status: result.status,
        missing: result.missing.length,
        ...(message ? { message } : {}),
      });
    } finally {
      this.pending.delete(jobId);
    }
  }

  /** Writes reviewed texts of the last fill as one change; the editor always gets an answer. */
  async apply({ requestId, jobId, items }: { requestId: string; jobId: string; items: AiApplyItem[] }) {
    const job = this.job;
    if (!job || job.id !== jobId) {
      await this.post({
        type: 'aiApplyResult',
        requestId,
        written: [],
        skipped: [],
        message: vscode.l10n.t('These suggestions belong to an older fill; nothing was written.'),
      });
      return;
    }
    try {
      const { index, fileStore } = this.services;
      // A write answers before its files are indexed again: plan on the index that has it.
      await fileStore.indexed();
      const found = findBundle(await index.latest(), this.target);
      const outcome = found
        ? await applyFill(
            fileStore,
            found,
            job.locale,
            items.filter((item) => job.entries.has(item.entryId)),
          )
        : {
            written: [],
            skipped: [],
            message: vscode.l10n.t('The key or the language is no longer in this bundle.'),
          };
      await this.post({ type: 'aiApplyResult', requestId, ...outcome });
    } catch (error) {
      this.services.log.error('Writing reviewed texts failed.', error);
      await this.post({
        type: 'aiApplyResult',
        requestId,
        written: [],
        skipped: [],
        message: vscode.l10n.t('The texts could not be written: {error}', { error: messageOf(error) }),
      });
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
