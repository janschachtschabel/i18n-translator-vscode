import { computed, signal } from '@preact/signals';
import { filterRows, type FilterResult, type RowFilter } from '../../shared/filter';
import {
  DEFAULT_UI_STATE,
  type HostToWebview,
  type UiState,
  type WebviewToHost,
} from '../../shared/protocol';
import type { BundleViewModel, LocaleView } from '../../shared/viewModel';
import { l10n, setTranslations } from '../l10n';
import { compactLocales, layoutFor } from './layout';

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
  /** The width of the editor; the app follows resizing. */
  readonly width = signal(window.innerWidth);
  /** Table, list or compact list: as the user chose, or by width. Changes only when the layout does. */
  readonly layout = computed(() => layoutFor(this.uiState.value.layout, this.width.value));
  // Their own signals, so that a change of the filter does not make a new list of languages: the rows
  // render again only when their props change.
  private readonly hiddenLocales = computed(() => this.uiState.value.hiddenLocales);
  private readonly compactLocale = computed(() => this.uiState.value.compactLocale);
  /** The languages the rows show: the visible ones, in the compact list the reference and one more. */
  readonly shownLocales = computed((): LocaleView[] => {
    const view = this.view.value;
    if (view.kind !== 'bundle') {
      return [];
    }
    const hiddenLocales = this.hiddenLocales.value;
    const compactLocale = this.compactLocale.value;
    return this.layout.value === 'compact'
      ? compactLocales(view.model.locales, hiddenLocales, compactLocale)
      : view.model.locales.filter((locale) => !hiddenLocales.includes(locale.code));
  });
  /** The rows the filter lets through, looking at the languages that are shown; undefined without a bundle. */
  readonly filtered = computed((): FilterResult | undefined => {
    const view = this.view.value;
    if (view.kind !== 'bundle') {
      return undefined;
    }
    const shown = new Set(this.shownLocales.value.map((locale) => locale.code));
    const hidden = view.model.locales.map((locale) => locale.code).filter((code) => !shown.has(code));
    return filterRows(view.model, this.uiState.value.filter, hidden);
  });

  /** The key whose card takes the focus when the list replaces a table that had it; null: the first card. */
  private focusHandoff: string | null | undefined;

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
        if (this.announcement.value.text !== '') {
          // "The bundle is gone" is no longer true; browsing screen reader users would still find it.
          this.announce('');
        }
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

  /**
   * Changes how the bundle is shown; the host keeps it for the next time the editor opens (B7). Before `init`
   * there is no state to change: it would replace the one the host kept. The filter runs before the state is
   * sent, so that a regular expression that never ends (the user's own) is never kept to hang every opening.
   */
  updateUiState(change: Partial<UiState>): void {
    if (this.view.value.kind === 'starting') {
      return;
    }
    this.uiState.value = { ...this.uiState.value, ...change };
    void this.filtered.value;
    this.host.postMessage({ type: 'uiState', state: this.uiState.value });
  }

  toggleLocale(code: string): void {
    const hidden = this.uiState.value.hiddenLocales;
    this.updateUiState({
      hiddenLocales: hidden.includes(code) ? hidden.filter((other) => other !== code) : [...hidden, code],
    });
  }

  updateFilter(change: Partial<RowFilter>): void {
    this.updateUiState({ filter: { ...this.uiState.value.filter, ...change } });
  }

  /** Only the keys with missing texts, or all again (Alt+M). */
  toggleMissing(): void {
    if (this.view.value.kind !== 'bundle') {
      return;
    }
    this.updateFilter({ status: this.uiState.value.filter.status === 'missing' ? 'all' : 'missing' });
  }

  /** Called by a table that goes while it has the focus, with its active key (null: its header row). */
  handOffFocus(entryId: string | null): void {
    this.focusHandoff = entryId;
  }

  /** The key the focus was handed off with, once; undefined: nothing was handed off. */
  takeFocusHandoff(): string | null | undefined {
    const entryId = this.focusHandoff;
    this.focusHandoff = undefined;
    return entryId;
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
