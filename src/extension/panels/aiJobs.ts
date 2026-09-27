import * as vscode from 'vscode';
import type { JobResult } from '../../core/ai/aiJob';
import type { ClientOptions } from '../../core/ai/bapiClient';
import type { Bundle } from '../../core/model/bundle';
import type { AiApplyItem, AiJobItem } from '../../shared/aiProtocol';
import type { HostToWebview, PanelState } from '../../shared/protocol';
import { showInfo } from '../notify';
import { aiFailureMessage, explainUnavailable } from '../services/aiFeedback';
import type { AiStatus } from '../services/aiService';
import { messageOf } from '../services/errors';
import type { IndexedRoot } from '../services/workspaceIndex';
import type { AiPanelServices } from './aiPanel';
import { applyAiChanges } from './applyAiChanges';
import { findBundle } from './findBundle';

/** A job asks for a confirmation from this many requests on. */
const CONFIRM_REQUESTS = 5;

/** A language of a bundle a job works on, with its texts and where they are translated from. */
export interface JobChoice {
  locale: string;
  source: string;
  /** In the order of the bundle's keys, with the text each has now (null: none). */
  entries: { entryId: string; before: string | null }[];
}

export interface JobRun {
  client: ClientOptions;
  status: AiStatus;
  bundle: Bundle;
  root: IndexedRoot;
  choice: JobChoice;
  signal: AbortSignal;
  /** Items for the review list as they come, with how many texts are done. */
  onItems: (items: AiJobItem[], done: number, total: number) => void;
}

/** What makes a job a fill or a check: which texts it offers, how it asks, and how it runs. */
export interface JobKind {
  kind: Extract<HostToWebview, { type: 'aiJob' }>['kind'];
  choices: (bundle: Bundle, root: IndexedRoot) => JobChoice[];
  /** Says that the bundle has nothing for the job. */
  nothing: (bundle: Bundle) => string;
  /** The placeholder of the choice of the language. */
  pickTitle: () => string;
  /** The question before a job of many requests, and the button that starts it. */
  question: (bundle: Bundle, choice: JobChoice, status: AiStatus, requests: number) => string;
  start: () => string;
  run: (run: JobRun) => Promise<JobResult>;
}

/**
 * The jobs of one editor, one at a time: a fill or a check of a language, whose items go to the review list as they
 * come; the texts of the last job may be written until the next one begins.
 */
export class AiJobs {
  private running: { id: string; controller: AbortController } | undefined;
  private last: { id: string; locale: string; entries: ReadonlySet<string> } | undefined;
  private count = 0;

  constructor(
    private readonly target: PanelState,
    private readonly services: AiPanelServices,
    private readonly post: (message: HostToWebview) => Promise<void>,
  ) {}

  /**
   * Asks which language (with its number of texts), confirms a job of many requests and the consent, then sends the
   * items to the review list as they come.
   */
  async run(kind: JobKind): Promise<void> {
    const { ai, consent, index, prompts, log } = this.services;
    if (this.running) {
      void showInfo(vscode.l10n.t('An AI job of this bundle is running; cancel it or wait until it ends.'));
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
    const choices = kind.choices(found.bundle, found.root);
    if (choices.length === 0) {
      void showInfo(kind.nothing(found.bundle));
      return;
    }
    const choice = await prompts.pick(
      choices.map((candidate) => ({
        label: candidate.locale,
        description: vscode.l10n.t('{count} texts', { count: String(candidate.entries.length) }),
        value: candidate,
      })),
      kind.pickTitle(),
    );
    if (!choice) {
      return;
    }
    const { status } = client;
    const requests = Math.ceil(choice.entries.length / status.settings.batchSize);
    if (
      requests >= CONFIRM_REQUESTS &&
      !(await prompts.confirm(kind.question(found.bundle, choice, status, requests), kind.start()))
    ) {
      return;
    }
    if (!(await consent.ensure(status.host, prompts))) {
      return;
    }
    const jobId = `${kind.kind}-${++this.count}`;
    const controller = new AbortController();
    this.running = { id: jobId, controller };
    this.last = {
      id: jobId,
      locale: choice.locale,
      entries: new Set(choice.entries.map((entry) => entry.entryId)),
    };
    const started = Date.now();
    try {
      await this.post({
        type: 'aiJob',
        jobId,
        kind: kind.kind,
        locale: choice.locale,
        source: choice.source,
        total: choice.entries.length,
      });
      const result = await kind.run({
        client: client.options,
        status,
        bundle: found.bundle,
        root: found.root,
        choice,
        signal: controller.signal,
        onItems: (items, done, total) => void this.post({ type: 'aiJobItems', jobId, items, done, total }),
      });
      const message = result.status === 'failed' ? aiFailureMessage(result.error, status) : undefined;
      const answered = choice.entries.length - result.missing.length;
      log.info(
        `AI ${kind.kind} of ${found.bundle.name} in ${choice.locale}: ${result.status}, ${answered} of ${choice.entries.length} texts in ${Date.now() - started} ms.`,
      );
      await this.post({
        type: 'aiJobEnd',
        jobId,
        status: result.status,
        missing: result.missing.length,
        ...(message ? { message } : {}),
      });
    } finally {
      if (this.running?.id === jobId) {
        this.running = undefined;
      }
    }
  }

  /** Writes reviewed texts of the last job as one change; the editor always gets an answer. */
  async apply({ requestId, jobId, items }: { requestId: string; jobId: string; items: AiApplyItem[] }) {
    const job = this.last;
    if (!job || job.id !== jobId) {
      await this.post({
        type: 'aiApplyResult',
        requestId,
        written: [],
        skipped: [],
        message: vscode.l10n.t('These suggestions belong to an older job; nothing was written.'),
      });
      return;
    }
    try {
      const { index, fileStore } = this.services;
      // A write answers before its files are indexed again: plan on the index that has it.
      await fileStore.indexed();
      const found = findBundle(await index.latest(), this.target);
      const outcome = found
        ? await applyAiChanges(
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

  /** Cancels the running job if it is `jobId`. */
  cancel(jobId: string): void {
    if (this.running?.id === jobId) {
      this.running.controller.abort();
    }
  }

  /** Cancels the running job, e.g. when the page that shows it reloads or the editor closes. */
  abort(): void {
    this.running?.controller.abort();
    this.running = undefined;
  }
}
