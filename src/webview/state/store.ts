import { computed, effect, signal } from '@preact/signals';
import { filterRows, type FilterResult, type RowFilter } from '../../shared/filter';
import { applyPatch } from '../../shared/patch';
import {
  DEFAULT_UI_STATE,
  type EditorCommand,
  type HostToWebview,
  type UiState,
  type WebviewToHost,
} from '../../shared/protocol';
import type { BundleViewModel } from '../../shared/viewModel';
import { formatNumber, l10n, setTranslations } from '../l10n';
import { sameColumnsAsBefore, type LocaleColumn } from './columns';
import { Edits, type CellRef, type EditorPlace } from './edits';
import { KeptUnsaved } from './keptUnsaved';
import { compactLocales, layoutFor } from './layout';
import { nextCell } from './navigation';
import { showEdits, withRowOf, type ShownRow } from './shownRows';

export type { LocaleColumn } from './columns';

/** Where the focus was in a layout that gave way to the other: a key (null: the header row) and a language (null: the key). */
export interface FocusHandoff {
  entryId: string | null;
  locale: string | null;
}

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
  // Their own signals, so that a change of one part of the view state recomputes only what depends on it: a new
  // filter makes no new list of languages (the rows render again only when their props change), and wrapping
  // filters no rows again.
  private readonly hiddenLocales = computed(() => this.uiState.value.hiddenLocales);
  private readonly compactLocale = computed(() => this.uiState.value.compactLocale);
  private readonly filter = computed(() => this.uiState.value.filter);
  private readonly sameColumns = sameColumnsAsBefore();
  /**
   * The languages the rows show: the visible ones, in the compact list the reference and one more. The same array
   * as long as the columns are the same, also with new counts of findings: the rows, which show no counts, then
   * render again only where a text changed (the chips take the counts from the model).
   */
  readonly shownLocales = computed((): readonly LocaleColumn[] => {
    const view = this.view.value;
    const hiddenLocales = this.hiddenLocales.value;
    const compactLocale = this.compactLocale.value;
    const shown =
      view.kind !== 'bundle'
        ? []
        : this.layout.value === 'compact'
          ? compactLocales(view.model.locales, hiddenLocales, compactLocale)
          : view.model.locales.filter((locale) => !hiddenLocales.includes(locale.code));
    return this.sameColumns(shown);
  });
  /** The rows the filter lets through, looking at the languages that are shown; undefined without a bundle. */
  readonly filtered = computed((): FilterResult | undefined => {
    const view = this.view.value;
    if (view.kind !== 'bundle') {
      return undefined;
    }
    const shown = new Set(this.shownLocales.value.map((locale) => locale.code));
    const hidden = view.model.locales.map((locale) => locale.code).filter((code) => !shown.has(code));
    return filterRows(view.model, this.filter.value, hidden);
  });
  readonly edits = new Edits(
    (message) => this.host.postMessage(message),
    (text) => this.announce(text),
  );
  /**
   * The rows the filter lets through, as the editor shows them: with the texts on their way to the files, and
   * with the row of the open editor while it is open, so that it stays while the user types.
   */
  readonly rows = computed((): readonly ShownRow[] => {
    const view = this.view.value;
    const filtered = this.filtered.value?.rows ?? [];
    const open = this.edits.open.value;
    const rows = view.kind === 'bundle' ? withRowOf(filtered, view.model.rows, open?.entryId) : filtered;
    return showEdits(rows, this.edits.pending.value, this.edits.rejected.value);
  });
  /** The key of the table's active cell, whose details the table shows; null before it has one. */
  readonly detailsKey = signal<string | null>(null);
  private readonly unsaved = new KeptUnsaved(this.edits, (message) => this.host.postMessage(message));
  /** The row the details show: that of their open editor, else of the table's active key; undefined: none. */
  readonly detailsRow = computed(() => {
    const open = this.edits.open.value;
    const key = open?.place === 'details' ? open.entryId : this.detailsKey.value;
    return key === null ? undefined : this.rows.value.find((row) => row.entryId === key);
  });

  /** Where the focus goes when one layout takes the place of the other, which had it. */
  private focusHandoff: FocusHandoff | undefined;

  constructor(private readonly host: HostApi) {
    // A new layout may leave out the language of the open editor (e.g. the compact list): it cannot stay open.
    effect(() => {
      const shown = this.shownLocales.value;
      const table = this.layout.value === 'table';
      const open = this.edits.open.peek();
      if (
        open &&
        !(table && open.place === 'details') &&
        !shown.some((locale) => locale.code === open.locale)
      ) {
        this.edits.park();
      }
    });
  }

  receive(message: HostToWebview): void {
    switch (message.type) {
      case 'init':
        setTranslations(message.l10n);
        this.uiState.value = message.uiState;
        this.host.setState(message.panelState);
        this.edits.reset();
        this.unsaved.expect(message.unsaved ?? []);
        // The host follows up with the bundle, or with it once the first index run is done.
        this.view.value = { kind: 'loading' };
        break;
      case 'bundle': {
        const before = this.view.value.kind;
        if (before === 'missing') {
          // "The bundle is gone" is no longer true; browsing screen reader users would still find it.
          this.announce('');
        }
        this.edits.update(message.model);
        const restored = this.unsaved.restore();
        this.view.value = { kind: 'bundle', model: message.model };
        const back =
          restored > 0
            ? l10n.t('Texts not saved before, back in their cells: {count}', {
                count: formatNumber(restored),
              })
            : '';
        if (before === 'loading') {
          // The texts appear while the focus is elsewhere; screen readers would not notice.
          const counts = l10n.t('Keys: {keys} · Languages: {languages}', {
            keys: formatNumber(message.model.rows.length),
            languages: formatNumber(message.model.locales.length),
          });
          this.announce(
            `${l10n.t('{name} is open.', { name: message.model.name })} ${counts} ${back}`.trim(),
          );
        } else if (back) {
          this.announce(back);
        }
        break;
      }
      case 'missing':
        // Someone working in the bundle should hear that it is gone; on opening, the page says it.
        if (this.view.value.kind === 'bundle') {
          this.announce(missingNotice(message.name));
        }
        this.edits.bundleGone();
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

  /**
   * Called by the table (grid or details) or the list when it goes while it has the focus, with where the focus
   * was: for the other layout, if that takes its place. One that just goes (e.g. no key matches the filter) hands
   * nothing on, so that nothing takes the focus later.
   */
  handOffFocus(from: 'table' | 'list', place: FocusHandoff): void {
    const replaced = from === 'table' ? this.layout.peek() !== 'table' : this.layout.peek() === 'table';
    if (replaced) {
      this.focusHandoff = place;
    }
  }

  /** Where the focus was handed off, once; undefined: nothing was handed off. */
  takeFocusHandoff(): FocusHandoff | undefined {
    const place = this.focusHandoff;
    this.focusHandoff = undefined;
    return place;
  }

  /** Opens the editor of a cell in the rows or in the details, with the text the cell shows. */
  edit(entryId: string, locale: string, place: EditorPlace = 'rows'): void {
    // The open editor first: when it is the same cell's, the cell then shows the text just sent.
    this.edits.commit();
    this.edits.start({ entryId, locale }, this.shownText(entryId, locale), place);
  }

  /**
   * Saves the open editor and opens the one of the next (1) or the previous (-1) cell, in reading order: in the
   * rows along the languages shown, in the details along all languages of their key. False if there is none.
   */
  editNext(direction: 1 | -1): boolean {
    const open = this.edits.open.value;
    // Without the details (the list), an editor that opened there goes on in the rows.
    const place = open?.place === 'details' && this.layout.value === 'table' ? 'details' : 'rows';
    const next = open ? this.nextCell(open, place, direction) : undefined;
    this.edits.commit();
    if (!next) {
      return false;
    }
    this.edit(next.entryId, next.locale, place);
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

  private nextCell(open: CellRef, place: EditorPlace, direction: 1 | -1): CellRef | undefined {
    if (place === 'rows') {
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
