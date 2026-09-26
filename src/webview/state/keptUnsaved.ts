import { effect, signal } from '@preact/signals';
import { fitUnsavedTexts, type UnsavedText, type WebviewToHost } from '../../shared/protocol';
import type { Edits } from './edits';

/** How long typing rests before the texts that are not saved go to the host. */
const DELAY_MS = 300;

/**
 * The texts of a bundle that are not saved, kept by the host, so that closing the editor or reloading the window
 * loses none: the ones it kept come back with the first model after `init`, and every change goes to it, while
 * typing a moment later.
 */
export class KeptUnsaved {
  /** The texts the host kept, until the first model has them back in their cells. */
  private restoring: readonly UnsavedText[] | undefined;
  /** Whether changes go to the host: only once the texts it kept are back, or they would be lost. */
  private readonly active = signal(false);
  /** The texts the host has (as JSON), so that only a change goes to it. */
  private kept = '[]';
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly edits: Edits,
    private readonly post: (message: WebviewToHost) => void,
  ) {
    effect(() => {
      const texts = this.edits.unsaved();
      if (!this.active.value) {
        return;
      }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.keep(texts), DELAY_MS);
    });
  }

  /** On `init`: the texts the host kept, for the first model. */
  expect(texts: readonly UnsavedText[]): void {
    this.restoring = texts;
    this.kept = JSON.stringify(texts);
    this.active.value = false;
  }

  /** On a model: brings the texts the host kept back, the first time; how many came back. */
  restore(): number {
    const restored = this.restoring ? this.edits.restore(this.restoring) : 0;
    this.restoring = undefined;
    this.active.value = true;
    return restored;
  }

  private keep(all: UnsavedText[]): void {
    const texts = fitUnsavedTexts(all);
    const json = JSON.stringify(texts);
    if (json !== this.kept) {
      this.kept = json;
      this.post({ type: 'unsaved', texts });
    }
  }
}
