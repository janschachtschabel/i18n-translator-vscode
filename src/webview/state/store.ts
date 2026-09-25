import { signal } from '@preact/signals';
import {
  DEFAULT_UI_STATE,
  type HostToWebview,
  type UiState,
  type WebviewToHost,
} from '../../shared/protocol';
import type { BundleViewModel } from '../../shared/viewModel';
import { l10n, setTranslations } from '../l10n';

/** The part of the webview API (`acquireVsCodeApi()`) the editor uses. */
export interface HostApi {
  postMessage(message: WebviewToHost): void;
  /** Kept by VS Code for the serializer that restores the editor after a restart. */
  setState(state: unknown): void;
}

export type View =
  /** Before `init`, without texts in the user's language: nothing is shown. */
  | { kind: 'starting' }
  | { kind: 'loading' }
  | { kind: 'bundle'; model: BundleViewModel }
  | { kind: 'missing'; name: string };

/** A text for screen readers; a new `id` has them read it again, even if the text is the same. */
export interface Announcement {
  text: string;
  id: number;
}

/** What the editor shows, following the messages of the host. */
export class EditorStore {
  readonly view = signal<View>({ kind: 'starting' });
  readonly uiState = signal<UiState>(DEFAULT_UI_STATE);
  readonly announcement = signal<Announcement>({ text: '', id: 0 });

  constructor(private readonly host: HostApi) {}

  receive(message: HostToWebview): void {
    switch (message.type) {
      case 'init':
        setTranslations(message.l10n);
        this.uiState.value = message.uiState;
        this.host.setState(message.panelState);
        // The host follows up with the bundle, or with it once the first index run is done.
        this.view.value = { kind: 'loading' };
        break;
      case 'bundle':
        this.view.value = { kind: 'bundle', model: message.model };
        break;
      case 'missing':
        // Someone working in the bundle should hear that it is gone; on opening, the page says it.
        if (this.view.value.kind === 'bundle') {
          this.announce(missingNotice(message.name));
        }
        this.view.value = { kind: 'missing', name: message.name };
        break;
    }
  }

  /** Has screen readers read `text` once they have finished what they are reading. */
  announce(text: string): void {
    this.announcement.value = { text, id: this.announcement.value.id + 1 };
  }

  /** Changes how the bundle is shown; the host keeps it for the next time the editor opens (B7). */
  updateUiState(change: Partial<UiState>): void {
    this.uiState.value = { ...this.uiState.value, ...change };
    this.host.postMessage({ type: 'uiState', state: this.uiState.value });
  }

  toggleLocale(code: string): void {
    const hidden = this.uiState.value.hiddenLocales;
    this.updateUiState({
      hiddenLocales: hidden.includes(code) ? hidden.filter((other) => other !== code) : [...hidden, code],
    });
  }

  /** Undoes the last change of this session to the translation files, in whichever bundle it was. */
  undo(): void {
    this.host.postMessage({ type: 'undo' });
  }
}

export function missingNotice(name: string): string {
  return l10n.t('{name} is no longer in the workspace. It may have been renamed, moved or deleted.', {
    name,
  });
}
