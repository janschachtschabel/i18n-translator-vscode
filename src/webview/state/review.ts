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
  /** Chosen to be written; never while the text is the one the cell has, which leaves nothing to write. */
  chosen: boolean;
  /** What the check found, in the user's language. */
  problem?: { severity: 'error' | 'warning' | 'info'; message: string };
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
  /** A fill (suggestions for missing texts) or a check (corrections of what it found). */
  kind: JobKind;
  locale: string;
  /** The language the texts are translated from. */
  source: string;
  items: readonly ReviewItem[];
  /** How many texts the job asks about. */
  total: number;
  /** How many suggestions came, also those written since. */
  received: number;
  progress: ReviewProgress;
  /** The write on its way, by its request id. */
  applying?: string;
  /** Why the last write failed as a whole, in the user's language. */
  message?: string;
}

type JobMessage = Extract<AiHostToWebview, { type: 'aiJob' | 'aiJobItems' | 'aiJobEnd' | 'aiApplyResult' }>;
export type JobKind = Extract<AiHostToWebview, { type: 'aiJob' }>['kind'];

/**
 * The review list of a job (design §6.12, K3/K4): the suggestions come chunk by chunk. Those of a fill are chosen
 * unless they have an error, the corrections of a check are not (they change texts the user wrote); the user edits
 * and chooses, and writes the chosen ones at once. Esc cancels nothing (K10).
 */
export class Review {
  readonly list = signal<ReviewList | undefined>(undefined);
  private applies = 0;
  /** The kind of the job whose list closed with the focus in it: the button that started it takes the focus. */
  private focusBack: JobKind | undefined;

  constructor(
    private readonly post: (message: WebviewToHost) => void,
    private readonly announce: (text: string) => void,
    private readonly syntax: () => PlaceholderSyntax,
  ) {}

  /** Has the host ask which language to fill; the list opens when the job begins. */
  fill(): void {
    this.post({ type: 'aiFill' });
  }

  /** Has the host ask which language to check; the list opens when the job begins. */
  check(): void {
    this.post({ type: 'aiCheck' });
  }

  receive(message: JobMessage): void {
    switch (message.type) {
      case 'aiJob': {
        const { jobId, kind, locale, source, total } = message;
        const progress: ReviewProgress = { kind: 'running', done: 0, total };
        this.list.value = { jobId, kind, locale, source, items: [], total, received: 0, progress };
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
          .map((item) => this.itemOf(item, list.kind));
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
    this.change(entryId, (item) => ({ ...item, text, chosen: item.chosen && writable({ ...item, text }) }));
  }

  /** Only a text that has something to write can be chosen: an empty one, or the cell's, would write nothing. */
  toggle(entryId: string): void {
    this.change(entryId, (item) => ({ ...item, chosen: !item.chosen && writable(item) }));
  }

  /** Chooses every text that has something to write, or none. */
  chooseAll(chosen: boolean): void {
    const list = this.list.peek();
    if (list) {
      this.list.value = {
        ...list,
        items: list.items.map((item) => ({ ...item, chosen: chosen && writable(item) })),
      };
    }
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
    // Not while its write is on its way: the result says what was written.
    if (this.list.peek()?.applying !== undefined) {
      return;
    }
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

  /** Called by the list of a job of `kind` when it closes with the focus in it. */
  handBackFocus(kind: JobKind): void {
    this.focusBack = kind;
  }

  /** The kind of the job whose list closed with the focus in it, once; undefined: none did. */
  takeFocusBack(): JobKind | undefined {
    const back = this.focusBack;
    this.focusBack = undefined;
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

  /**
   * A fill's suggestion is chosen unless the file could not take it as it is: empty, or with placeholders wrong; a
   * check's correction is never chosen, since it changes a text the user wrote (K3/K4).
   */
  private itemOf({ entryId, source, before, text, problem }: AiJobItem, kind: JobKind): ReviewItem {
    const blocked =
      kind === 'check' ||
      !text.trim() ||
      text === before ||
      inlineCheck(source, text, this.syntax()).some((line) => line.severity === 'error');
    const key = displayKey(keyFromId(entryId));
    return { entryId, key, source, before, text, chosen: !blocked, ...(problem ? { problem } : {}) };
  }
}

/** Whether a text has something to write: not empty, and not the text the cell has. */
export function writable(item: Pick<ReviewItem, 'text' | 'before'>): boolean {
  return item.text.trim() !== '' && item.text !== item.before;
}
