import * as vscode from 'vscode';
import type { JobResult } from '../../core/ai/aiJob';
import type { ClientOptions } from '../../core/ai/bapiClient';
import type { AiSettings } from '../../core/config/aiSettings';
import type { Bundle } from '../../core/model/bundle';
import type { AiApplyItem, AiJobItem } from '../../shared/aiProtocol';
import type { HostToWebview, PanelState } from '../../shared/protocol';
import { showError, showInfo } from '../notify';
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

/** What a job needs once its questions are answered. */
interface JobStart {
  client: { options: ClientOptions; status: AiStatus };
  found: { bundle: Bundle; root: IndexedRoot };
  choice: JobChoice;
}

/** What makes a job a fill or a check: which texts it offers, how it asks, and how it runs. */
export interface JobKind {
  kind: Extract<HostToWebview, { type: 'aiJob' }>['kind'];
  choices: (bundle: Bundle, root: IndexedRoot) => JobChoice[];
  /** Says that the bundle has nothing for the job. */
  nothing: (bundle: Bundle) => string;
  /** The placeholder of the choice of the language. */
  pickTitle: () => string;
  /** The requests a job of the choice makes, as it cuts its texts: by number and by characters (audit L-17). */
  requests: (bundle: Bundle, root: IndexedRoot, choice: JobChoice, settings: AiSettings) => number;
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
  /** The job asking its questions, or running once `started`. */
  private running: { id: string; controller: AbortController; started: boolean } | undefined;
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
    if (this.running?.started) {
      void showInfo(vscode.l10n.t('An AI job of this bundle is running; cancel it or wait until it ends.'));
      return;
    }
    // A job still asking gives way to the new start: VS Code shows one choice at a time anyway.
    this.running?.controller.abort();
    // Registered before the first question, so that a cancel, a reload of the page or closing the editor stops a job
    // that is still starting, as for suggestions.
    const job = { id: `${kind.kind}-${++this.count}`, controller: new AbortController(), started: false };
    this.running = job;
    try {
      const start = await this.ask(kind, job.controller.signal);
      if (start) {
        job.started = true;
        await this.execute(kind, job.id, job.controller.signal, start);
      }
    } catch (error) {
      // Reading the key or the settings failed, e.g. without a keyring on Linux: the user learns of it, rather than
      // the log alone (audit API-03).
      this.services.log.error('An AI job could not start.', error);
      void showError(vscode.l10n.t('The AI job could not start: {error}', { error: messageOf(error) }));
    } finally {
      if (this.running === job) {
        this.running = undefined;
      }
    }
  }

  /** The questions before a job; undefined when one is declined, there is nothing to do, or the job was stopped. */
  private async ask(kind: JobKind, signal: AbortSignal): Promise<JobStart | undefined> {
    const { ai, consent, index, prompts } = this.services;
    const client = await ai.client();
    // Stopped meanwhile (the editor closed, a new start): nothing to explain either.
    if (signal.aborted) {
      return undefined;
    }
    if (!client) {
      void explainUnavailable((await ai.status()).reason ?? 'no-key');
      return undefined;
    }
    const found = findBundle(await index.latest(), this.target);
    if (!found || signal.aborted) {
      return undefined;
    }
    const choices = kind.choices(found.bundle, found.root);
    if (choices.length === 0) {
      void showInfo(kind.nothing(found.bundle));
      return undefined;
    }
    const choice = await prompts.pick(
      choices.map((candidate) => ({
        label: candidate.locale,
        description: vscode.l10n.t('{count} texts', { count: String(candidate.entries.length) }),
        value: candidate,
      })),
      kind.pickTitle(),
    );
    if (!choice || signal.aborted) {
      return undefined;
    }
    const { status } = client;
    const requests = kind.requests(found.bundle, found.root, choice, status.settings);
    if (
      requests >= CONFIRM_REQUESTS &&
      !(await prompts.confirm(kind.question(found.bundle, choice, status, requests), kind.start()))
    ) {
      return undefined;
    }
    if (signal.aborted || !(await consent.ensure(status.host, prompts)) || signal.aborted) {
      return undefined;
    }
    return { client, found, choice };
  }

  /** Runs a job whose questions are answered: its items go to the review list as they come. */
  private async execute(
    kind: JobKind,
    jobId: string,
    signal: AbortSignal,
    { client, found, choice }: JobStart,
  ) {
    const { status } = client;
    this.last = {
      id: jobId,
      locale: choice.locale,
      entries: new Set(choice.entries.map((entry) => entry.entryId)),
    };
    const started = Date.now();
    await this.post({
      type: 'aiJob',
      jobId,
      kind: kind.kind,
      locale: choice.locale,
      source: choice.source,
      total: choice.entries.length,
    });
    // A job cancelled meanwhile still ends, so that its list stops waiting: runAiJob sends nothing then.
    const result = await kind.run({
      client: client.options,
      status,
      bundle: found.bundle,
      root: found.root,
      choice,
      signal,
      onItems: (items, done, total) => void this.post({ type: 'aiJobItems', jobId, items, done, total }),
    });
    const message = result.status === 'failed' ? aiFailureMessage(result.error, status) : undefined;
    const answered = choice.entries.length - result.missing.length;
    this.services.log.info(
      `AI ${kind.kind} of ${found.bundle.name} in ${choice.locale}: ${result.status}, ${answered} of ${choice.entries.length} texts in ${Date.now() - started} ms.`,
    );
    await this.post({
      type: 'aiJobEnd',
      jobId,
      status: result.status,
      missing: result.missing.length,
      ...(message ? { message } : {}),
    });
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
      // Its list shows why, instead of keeping it chosen.
      const outside = items
        .filter((item) => !job.entries.has(item.entryId))
        .map(({ entryId }) => ({
          entryId,
          message: vscode.l10n.t('This text does not belong to the job of the list; it was not written.'),
        }));
      await this.post({
        type: 'aiApplyResult',
        requestId,
        ...outcome,
        skipped: [...outcome.skipped, ...outside],
      });
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
