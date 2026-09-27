import { signal } from '@preact/signals';
import type { PlaceholderSyntax } from '../../core/area/areaDefinition';
import { displayKey, keyFromId } from '../../core/model/keys';
import type { AiHostToWebview, AiJobItem } from '../../shared/aiProtocol';
import type { WebviewToHost } from '../../shared/protocol';
import { inlineCheck } from '../inlineCheck';
import { formatNumber, l10n } from '../l10n';

/** A suggestion in the review list, as the user left it. */
export interface ReviewItem {
  entryId: string;
  /** The key as the editor shows it. */
  key: string;
  /** The text it was translated from. */
  source: string;
  /** The text the cell had when the job began (null: none), which the host checks before it writes (B5). */
  before: string | null;
  /** The suggestion, as the user edited it. */
  text: string;
  chosen: boolean;
  /** Why the last write left it out, in the user's language. */
  notSaved?: string;
}

export type ReviewProgress =
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done' | 'cancelled'; missing: number }
  | { kind: 'failed'; message: string };

/** The suggestions of a job, which the editor shows in place of the rows (K1) until they are written or discarded. */
export interface ReviewList {
  jobId: string;
  locale: string;
  /** The language the texts are translated from. */
  source: string;
  items: readonly ReviewItem[];
  /** How many suggestions came, also those written since. */
  received: number;
  progress: ReviewProgress;
  /** The write on its way, by its request id. */
  applying?: string;
  /** Why the last write failed as a whole, in the user's language. */
  message?: string;
}

type JobMessage = Extract<AiHostToWebview, { type: 'aiJob' | 'aiJobItems' | 'aiJobEnd' | 'aiApplyResult' }>;

/**
 * The review list of a fill (design §6.12, K3/K4): the suggestions come chunk by chunk, those without an error
 * chosen; the user edits and chooses, and writes the chosen ones at once. Esc cancels nothing (K10).
 */
export class Review {
  readonly list = signal<ReviewList | undefined>(undefined);
  private applies = 0;
  /** Whether the list had the focus when it closed; the button that starts a fill takes it then. */
  private focusBack = false;

  constructor(
    private readonly post: (message: WebviewToHost) => void,
    private readonly announce: (text: string) => void,
    private readonly syntax: () => PlaceholderSyntax,
  ) {}

  /** Has the host ask which language to fill; the list opens when the job begins. */
  fill(): void {
    this.post({ type: 'aiFill' });
  }

  receive(message: JobMessage): void {
    switch (message.type) {
      case 'aiJob': {
        const { jobId, locale, source, total } = message;
        const progress: ReviewProgress = { kind: 'running', done: 0, total };
        this.list.value = { jobId, locale, source, items: [], received: 0, progress };
        return;
      }
      case 'aiJobItems': {
        const list = this.list.peek();
        if (list?.jobId !== message.jobId) {
          return;
        }
        const known = new Set(list.items.map((item) => item.entryId));
        const items = message.items
          .filter((item) => !known.has(item.entryId))
          .map((item) => this.itemOf(item));
        this.list.value = {
          ...list,
          items: [...list.items, ...items],
          received: list.received + items.length,
          progress:
            list.progress.kind === 'running'
              ? { kind: 'running', done: message.done, total: message.total }
              : list.progress,
        };
        return;
      }
      case 'aiJobEnd': {
        const list = this.list.peek();
        if (list?.jobId !== message.jobId) {
          return;
        }
        const progress: ReviewProgress =
          message.status === 'failed'
            ? { kind: 'failed', message: message.message ?? '' }
            : { kind: message.status, missing: message.missing };
        this.list.value = { ...list, progress };
        return;
      }
      case 'aiApplyResult':
        this.applied(message);
        return;
    }
  }

  setText(entryId: string, text: string): void {
    this.change(entryId, (item) => ({ ...item, text }));
  }

  toggle(entryId: string): void {
    this.change(entryId, (item) => ({ ...item, chosen: !item.chosen }));
  }

  /** Cancels the job; the suggestions that came stay. */
  cancel(): void {
    const list = this.list.peek();
    if (list?.progress.kind === 'running') {
      this.post({ type: 'aiCancel', requestId: list.jobId });
    }
  }

  /** Closes the list without writing, and cancels its job if it still runs. */
  discard(): void {
    this.cancel();
    this.list.value = undefined;
  }

  /** Has the host write the chosen texts, as edited, as one change (K7). */
  apply(): void {
    const list = this.list.peek();
    const chosen = list?.items.filter((item) => item.chosen) ?? [];
    if (!list || list.applying !== undefined || chosen.length === 0) {
      return;
    }
    const requestId = `apply-${++this.applies}`;
    this.list.value = { ...list, applying: requestId, message: undefined };
    this.post({
      type: 'aiApply',
      requestId,
      jobId: list.jobId,
      items: chosen.map(({ entryId, text, before }) => ({ entryId, value: text, before })),
    });
  }

  /** On `init`: a new page has no list; the host cancels the job of the page before. */
  reset(): void {
    this.list.value = undefined;
  }

  /** Called by the list when it closes with the focus in it. */
  handBackFocus(): void {
    this.focusBack = true;
  }

  /** Whether the list closed with the focus in it, once. */
  takeFocusBack(): boolean {
    const back = this.focusBack;
    this.focusBack = false;
    return back;
  }

  /**
   * The written texts leave the list, the skipped ones stay unchosen with their reason. Once all are written and
   * the job has ended, the list closes and the rows are back.
   */
  private applied(message: Extract<JobMessage, { type: 'aiApplyResult' }>): void {
    const list = this.list.peek();
    if (list?.applying !== message.requestId) {
      return;
    }
    const written = new Set(message.written);
    const skipped = new Map(message.skipped.map(({ entryId, message: reason }) => [entryId, reason]));
    const items = list.items.flatMap((item) => {
      if (written.has(item.entryId)) {
        return [];
      }
      const reason = skipped.get(item.entryId);
      return [reason === undefined ? item : { ...item, chosen: false, notSaved: reason }];
    });
    const saved =
      message.written.length > 0
        ? l10n.t('Texts saved: {count}.', { count: formatNumber(message.written.length) })
        : '';
    const notSaved =
      skipped.size > 0
        ? l10n.t('Texts not saved: {count}; the list says why.', { count: formatNumber(skipped.size) })
        : '';
    if (saved || notSaved) {
      this.announce(`${saved} ${notSaved}`.trim());
    }
    if (items.length === 0 && list.progress.kind !== 'running' && message.message === undefined) {
      this.list.value = undefined;
      return;
    }
    this.list.value = { ...list, items, applying: undefined, message: message.message };
  }

  private change(entryId: string, update: (item: ReviewItem) => ReviewItem): void {
    const list = this.list.peek();
    if (list) {
      this.list.value = {
        ...list,
        items: list.items.map((item) => (item.entryId === entryId ? update(item) : item)),
      };
    }
  }

  /** A suggestion is chosen unless the file could not take it as it is: empty, or with placeholders wrong (K3/K4). */
  private itemOf({ entryId, source, before, text }: AiJobItem): ReviewItem {
    const blocked =
      !text.trim() || inlineCheck(source, text, this.syntax()).some((line) => line.severity === 'error');
    return { entryId, key: displayKey(keyFromId(entryId)), source, before, text, chosen: !blocked };
  }
}
