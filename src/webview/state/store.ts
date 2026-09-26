import { computed, signal } from '@preact/signals';
import { filterRows, type FilterResult, type RowFilter } from '../../shared/filter';
import { applyPatch } from '../../shared/patch';
import {
  DEFAULT_UI_STATE,
  type EditorCommand,
  type HostToWebview,
  type UiState,
  type WebviewToHost,
} from '../../shared/protocol';
import type { BundleViewModel, LocaleView } from '../../shared/viewModel';
import { l10n, setTranslations } from '../l10n';
import {
  Edits,
  nextCell,
  showEdits,
  type CellRef,
  type EditorPlace,
  type OpenEditor,
  type ShownRow,
} from './edits';
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
  readonly edits = new Edits(
    (message) => this.host.postMessage(message),
    (text) => this.announce(text),
  );
  /** The rows the filter lets through, as the editor shows them: with the texts on their way to the files. */
  readonly rows = computed((): readonly ShownRow[] =>
    showEdits(this.filtered.value?.rows ?? [], this.edits.pending.value, this.edits.rejected.value),
  );
  /** The key of the table's active cell, whose details the table shows; null before it has one. */
  readonly detailsKey = signal<string | null>(null);
  /** The row the details show; undefined when the filter does not let it through. */
  readonly detailsRow = computed(() => {
    const key = this.detailsKey.value;
    return key === null ? undefined : this.rows.value.find((row) => row.entryId === key);
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
        this.edits.reset();
        // The host follows up with the bundle, or with it once the first index run is done.
        this.view.value = { kind: 'loading' };
        break;
      case 'bundle':
        if (this.announcement.value.text !== '') {
          // "The bundle is gone" is no longer true; browsing screen reader users would still find it.
          this.announce('');
        }
        this.edits.update(message.model);
        this.view.value = { kind: 'bundle', model: message.model };
        break;
      case 'missing':
        // Someone working in the bundle should hear that it is gone; on opening, the page says it.
        if (this.view.value.kind === 'bundle') {
          this.announce(missingNotice(message.name));
        }
        this.edits.reset();
        this.view.value = { kind: 'missing', name: message.name };
        break;
      case 'patch': {
        const view = this.view.value;
        if (view.kind === 'bundle') {
          const model = applyPatch(view.model, message.patch);
          this.edits.update(model);
          this.view.value = { kind: 'bundle', model };
        }
        break;
      }
      case 'writeResult':
        this.edits.answer(message);
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
    // Its row may go with the change.
    this.edits.commit();
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

  /** Opens the editor of a cell in the rows or in the details, with the text the cell shows. */
  edit(entryId: string, locale: string, place: EditorPlace = 'rows'): void {
    this.edits.start({ entryId, locale }, this.shownText(entryId, locale), place);
  }

  /**
   * Saves the open editor and opens the one of the next (1) or the previous (-1) cell, in reading order: in the
   * rows along the languages shown, in the details along all languages of their key. False if there is none.
   */
  editNext(direction: 1 | -1): boolean {
    const open = this.edits.open.value;
    const next = open ? this.nextCell(open, direction) : undefined;
    this.edits.commit();
    if (!open || !next) {
      return false;
    }
    this.edit(next.entryId, next.locale, open.place);
    return true;
  }

  /** Deletes the text of a cell, so that the fallback applies (B2), e.g. an empty one; the host asks first. */
  deleteText(entryId: string, locale: string): void {
    this.edits.delete({ entryId, locale }, this.shownText(entryId, locale));
  }

  /** Asks the host for a key or language command; it asks the user for names and confirmations itself. */
  command(command: EditorCommand, entryId?: string): void {
    this.host.postMessage({ type: 'command', command, ...(entryId !== undefined ? { entryId } : {}) });
  }

  /** Undoes the last change of this session to the translation files, in whichever bundle it was. */
  undo(): void {
    this.host.postMessage({ type: 'undo' });
  }

  /** The text a cell shows, with the one on its way to the file. */
  private shownText(entryId: string, locale: string): string | undefined {
    return this.rows.value.find((row) => row.entryId === entryId)?.cells[locale]?.value;
  }

  private nextCell(open: OpenEditor, direction: 1 | -1): CellRef | undefined {
    if (open.place === 'rows') {
      return nextCell(this.rows.value, this.shownLocales.value, open, direction);
    }
    const view = this.view.value;
    const row = this.rows.value.find((candidate) => candidate.entryId === open.entryId);
    return view.kind === 'bundle' && row ? nextCell([row], view.model.locales, open, direction) : undefined;
  }
}

export function missingNotice(name: string): string {
  return l10n.t('{name} is no longer in the workspace. It may have been renamed, moved or deleted.', {
    name,
  });
}
