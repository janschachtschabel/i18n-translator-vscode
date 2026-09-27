import { effect, signal } from '@preact/signals';
import type { AiHostToWebview, AiUnavailableReason } from '../../shared/aiProtocol';
import type { WebviewToHost } from '../../shared/protocol';
import type { CellRef, Edits } from './edits';

/** Whether the AI can be used, as the host last said. */
export interface AiAvailability {
  available: boolean;
  reason?: AiUnavailableReason;
  model: string;
}

export type SuggestionState =
  | { kind: 'idle' }
  | { kind: 'loading'; requestId: string; cell: CellRef }
  | { kind: 'failed'; cell: CellRef; message: string };

/**
 * Suggestions of the AI for the open editor: one request at a time, which belongs to the editor that asked. When
 * that editor closes or another opens, the request is cancelled and a failure forgotten; an answer that comes
 * anyway is dropped.
 */
export class Suggestions {
  readonly ai = signal<AiAvailability>({ available: false, model: '' });
  readonly state = signal<SuggestionState>({ kind: 'idle' });
  private requests = 0;
  /**
   * Part of every request id: the host outlives a reload of the page, and an answer to a request of the page before
   * must not pass for one of this page.
   */
  private readonly page = Math.random().toString(36).slice(2, 10);

  constructor(
    private readonly post: (message: WebviewToHost) => void,
    private readonly edits: Edits,
  ) {
    // The editor closed or went to another cell, or its text changed outside it: a suggestion would go over a draft
    // typed against the old text (audit L-21).
    effect(() => {
      const open = this.edits.open.value;
      const state = this.state.peek();
      if (state.kind === 'idle' || (open && sameCell(open, state.cell) && !open.conflict)) {
        return;
      }
      if (state.kind === 'loading') {
        this.post({ type: 'aiCancel', requestId: state.requestId });
      }
      this.state.value = { kind: 'idle' };
    });
  }

  /**
   * Asks the host for a suggestion for the cell of the open editor, translated from `source` (the reference's text
   * or a variant's base): nothing without one. Without a key, it leads to setting one.
   */
  request(source: string | undefined): void {
    const open = this.edits.open.peek();
    const ai = this.ai.peek();
    if (!open || !source?.trim() || this.state.peek().kind === 'loading') {
      return;
    }
    if (!ai.available) {
      if (ai.reason === 'no-key') {
        this.setup();
      }
      return;
    }
    const requestId = `suggestion-${this.page}-${++this.requests}`;
    this.state.value = { kind: 'loading', requestId, cell: { entryId: open.entryId, locale: open.locale } };
    this.post({ type: 'aiSuggest', requestId, entryId: open.entryId, locale: open.locale });
  }

  /**
   * Esc in the editor: cancels the request, or takes the suggestion back out of the field; false when there was
   * neither, and Esc closes the editor.
   */
  escape(): boolean {
    const state = this.state.peek();
    if (state.kind === 'loading') {
      this.post({ type: 'aiCancel', requestId: state.requestId });
      this.state.value = { kind: 'idle' };
      return true;
    }
    return this.edits.takeBackSuggestion();
  }

  receive(message: Extract<AiHostToWebview, { type: 'aiState' | 'aiSuggestion' }>): void {
    if (message.type === 'aiState') {
      const { available, reason, model } = message;
      this.ai.value = { available, ...(reason ? { reason } : {}), model };
      return;
    }
    const state = this.state.peek();
    if (state.kind !== 'loading' || state.requestId !== message.requestId) {
      return;
    }
    if (message.text !== undefined) {
      // Into the field of the cell's editor, if it is still open.
      this.edits.suggest(state.cell, message.text);
      this.state.value = { kind: 'idle' };
    } else {
      this.state.value = { kind: 'failed', cell: state.cell, message: message.message ?? '' };
    }
  }

  /** The editor offers to set the key when there is none. */
  setup(): void {
    this.post({ type: 'aiSetup' });
  }

  /** The setup of the AI: the address of the b-api, its key, the model. */
  configure(): void {
    this.post({ type: 'aiConfigure' });
  }
}

function sameCell(a: CellRef, b: CellRef): boolean {
  return a.entryId === b.entryId && a.locale === b.locale;
}
