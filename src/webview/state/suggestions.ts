import { signal } from '@preact/signals';
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
 * Suggestions of the AI for the open editor: one request at a time, whose answer goes into the editor's field if
 * it is still that cell's; an answer for a cancelled request or a closed editor is dropped.
 */
export class Suggestions {
  readonly ai = signal<AiAvailability>({ available: false, model: '' });
  readonly state = signal<SuggestionState>({ kind: 'idle' });
  private requests = 0;

  constructor(
    private readonly post: (message: WebviewToHost) => void,
    private readonly edits: Edits,
  ) {}

  /** Asks the host for a suggestion for the cell of the open editor. */
  request(): void {
    const open = this.edits.open.peek();
    if (!open || !this.ai.peek().available || this.state.peek().kind === 'loading') {
      return;
    }
    const requestId = `suggestion-${++this.requests}`;
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
}
