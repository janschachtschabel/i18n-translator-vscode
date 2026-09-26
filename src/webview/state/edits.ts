import { batch, signal } from '@preact/signals';
import { displayKey, keyFromId } from '../../core/model/keys';
import type { HostToWebview, UnsavedText, WebviewToHost } from '../../shared/protocol';
import type { BundleViewModel } from '../../shared/viewModel';
import { l10n } from '../l10n';

/** A text of the bundle: a key in a language. */
export interface CellRef {
  entryId: string;
  locale: string;
}

/** Where an editor opens: in the rows of the table or the list, or in the details. */
export type EditorPlace = 'rows' | 'details';

/** The cell whose editor is open. */
export interface OpenEditor extends CellRef {
  /**
   * The text saving compares with (undefined: none), which the host checks against the file (B5): the text the
   * cell showed, or the newer one of a conflict or a failure the editor took in.
   */
  before: string | undefined;
  /** Why the text in the editor was not saved before, if it was not. */
  error: string | undefined;
  place: EditorPlace;
  /** Whether the text had several lines when editing began: then Enter starts a line and Ctrl+Enter saves. */
  multiline: boolean;
  /**
   * The cell's text changed outside the editor while it was open: to this text (undefined: deleted). With
   * `baseUnknown`, the draft was typed against a text the editor does not know (it opened with the choice, or the
   * host refused the draft): then only the user's choice ends the conflict, not a text that changes back.
   */
  conflict?: { text: string | undefined; baseUnknown?: true } | undefined;
}

/** A text sent to the host. */
export interface PendingEdit extends CellRef {
  requestId: string;
  value: string;
  /** The text it was sent against. */
  before: string | undefined;
  /** The host wrote it; every model after the answer has it. */
  written: boolean;
}

/** A text the host did not write, kept so that editing its cell again brings it back. */
export interface Rejection extends CellRef {
  text: string;
  message: string;
  /** The cell's text changed in the meantime (B5): editing it again offers the choice between both texts. */
  conflict: boolean;
}

type WriteResult = Extract<HostToWebview, { type: 'writeResult' }>;

/**
 * The editing of texts: the open editor, the texts on their way to the files and those the host did not write.
 * The host has the truth (B1); the rows show a sent text at once, and the old one again if writing fails. A text
 * the user typed is never lost without Esc: a text that could not be saved stays, marked, in its cell.
 */
export class Edits {
  readonly open = signal<OpenEditor | null>(null);
  /** The text in the open editor; only the editor reads it, so that typing renders nothing else. */
  readonly draft = signal('');
  /** In the order they were sent. */
  readonly pending = signal<readonly PendingEdit[]>([]);
  /** By {@link cellKey}. */
  readonly rejected = signal<ReadonlyMap<string, Rejection>>(new Map());
  private requests = 0;
  /** The last model, for the texts the cells have now. */
  private model: BundleViewModel | undefined;

  constructor(
    private readonly post: (message: WebviewToHost) => void,
    private readonly announce: (text: string) => void,
  ) {}

  /**
   * Opens the editor of a cell that shows `shown`, with the text that was not saved there, if there is one; that
   * of a conflict offers the choice again.
   */
  start(cell: CellRef, shown: string | undefined, place: EditorPlace): void {
    this.commit();
    const rejection = this.rejected.value.get(cellKey(cell));
    const draft = toTyped(rejection?.text ?? shown ?? '');
    batch(() => {
      this.open.value = {
        entryId: cell.entryId,
        locale: cell.locale,
        before: shown,
        error: rejection && !rejection.conflict ? rejection.message : undefined,
        place,
        multiline: draft.includes('\n'),
        conflict: rejection?.conflict ? { text: shown, baseUnknown: true } : undefined,
      };
      this.draft.value = draft;
    });
  }

  /**
   * Closes the editor and sends its text, unless it is the one the cell showed. In a conflict it sends nothing
   * against the old text: a typed text stays as not saved, and editing the cell again offers the choice.
   */
  commit(): void {
    const open = this.open.value;
    if (!open) {
      return;
    }
    const draft = this.draft.value;
    const typed = draft !== toTyped(open.before ?? '');
    batch(() => {
      this.close(open);
      if (typed && open.conflict) {
        this.reject(open, draft, conflictNotice(open), true);
      } else if (typed) {
        // The host clears a text of only white space (B2): the cell and the announcement say so.
        this.send(open, draft.trim() === '' ? '' : withLineBreaksOf(open.before, draft), open.before);
      }
    });
    if (typed && open.conflict) {
      this.announce(
        l10n.t('{key} in {locale}: not saved. {message}', { ...names(open), message: conflictNotice(open) }),
      );
    }
  }

  /** Closes the editor without sending its text; a text that was not saved in its cell is given up too. */
  cancel(): void {
    const open = this.open.value;
    if (open) {
      this.close(open);
    }
  }

  /**
   * Closes the editor when its cell cannot be shown (e.g. the list left out its language), and screen readers
   * hear why. A typed text stays as not saved in the cell, with a reason that is still true when the cell shows
   * again: the one it had, or that its language left the view.
   */
  park(): void {
    const open = this.open.value;
    if (!open) {
      return;
    }
    const draft = this.draft.value;
    if (draft === toTyped(open.before ?? '')) {
      this.close(open);
      return;
    }
    const reason = open.conflict
      ? conflictNotice(open)
      : (open.error ?? l10n.t('The editor closed when this language left the view.'));
    batch(() => {
      this.close(open);
      this.reject(open, draft, reason, open.conflict !== undefined);
    });
    this.announce(
      l10n.t('{key} in {locale} is not shown here; your text was kept as not saved.', names(open)),
    );
  }

  /**
   * Deletes the text of a cell that shows `shown`, so that the fallback applies (B2); the host asks first. For
   * an empty text, which editing cannot clear, as its text would not change.
   */
  delete(cell: CellRef, shown: string | undefined): void {
    this.send(cell, '', shown);
  }

  /** Takes the text that changed outside the editor: the draft becomes it, and saving compares with it. */
  takeTheirs(): void {
    const open = this.open.value;
    const conflict = open?.conflict;
    if (open && conflict) {
      batch(() => {
        this.open.value = { ...open, before: conflict.text, error: undefined, conflict: undefined };
        this.draft.value = toTyped(conflict.text ?? '');
      });
    }
  }

  /** Keeps the draft, so that saving it replaces the text that changed outside the editor. */
  keepMine(): void {
    const open = this.open.value;
    if (open?.conflict) {
      this.open.value = { ...open, before: open.conflict.text, error: undefined, conflict: undefined };
    }
  }

  /**
   * Takes the host's answer to a sent text. Without a message the user kept the old text (e.g. declined to
   * clear it). A text that failed takes the texts sent for its cell after it along: they were sent against it,
   * and the host would refuse them as changed. The newest of them stays as not saved, unless the cell's editor
   * is open again: then the failure goes into that editor, with the text the file has.
   */
  answer({ requestId, ok, message, conflict }: WriteResult): void {
    const pending = this.pending.value;
    const edit = pending.find((candidate) => candidate.requestId === requestId);
    if (ok) {
      if (edit) {
        this.pending.value = pending.map((candidate) =>
          candidate === edit ? { ...candidate, written: true } : candidate,
        );
      }
      this.announce(edit?.value === '' ? l10n.t('Text deleted.') : l10n.t('Saved.'));
      return;
    }
    if (!edit) {
      return;
    }
    const later =
      message === undefined
        ? []
        : pending.slice(pending.indexOf(edit) + 1).filter((other) => sameCell(other, edit));
    const newest = later.at(-1) ?? edit;
    batch(() => {
      this.pending.value = pending.filter((candidate) => candidate !== edit && !later.includes(candidate));
      if (message === undefined) {
        return;
      }
      const open = this.open.value;
      if (open && sameCell(open, edit)) {
        const now = this.textOf(edit);
        this.open.value = conflict
          ? { ...open, before: now, error: undefined, conflict: { text: now, baseUnknown: true } }
          : { ...open, before: now, error: message };
      } else {
        this.reject(edit, newest.value, message, conflict === true);
      }
    });
    if (message !== undefined) {
      this.announce(l10n.t('{key} in {locale}: not saved. {message}', { ...names(edit), message }));
    }
  }

  /**
   * Takes a new model. A written text is in every model after the host's answer, which comes from an index run
   * after the write: the cell shows the file from then on, also when it goes back to the old text (an undo). A
   * text for a key or a language the model no longer has cannot be saved: its editor closes and its mark goes.
   */
  update(model: BundleViewModel): void {
    this.model = model;
    let entries: ReadonlySet<string> | undefined;
    const exists = (cell: CellRef) => {
      entries ??= new Set(model.rows.map((row) => row.entryId));
      return entries.has(cell.entryId) && model.locales.some((locale) => locale.code === cell.locale);
    };
    batch(() => {
      const pending = this.pending.value.filter((edit) => !edit.written);
      if (pending.length < this.pending.value.length) {
        this.pending.value = pending;
      }
      const rejected = [...this.rejected.value].filter(([, rejection]) => exists(rejection));
      if (rejected.length < this.rejected.value.size) {
        this.rejected.value = new Map(rejected);
      }
      const open = this.open.value;
      if (open && !exists(open)) {
        this.open.value = null;
        this.announce(
          this.draft.value === toTyped(open.before ?? '')
            ? l10n.t('{key} in {locale} is no longer in this bundle.', names(open))
            : l10n.t(
                '{key} in {locale} is no longer in this bundle; the text you typed was not saved.',
                names(open),
              ),
        );
      } else if (open) {
        this.checkConflict(open);
      }
    });
  }

  /**
   * The bundle left the index for a while (e.g. a branch switch): the texts that were not saved stay for its
   * return, and a typed text of the open editor joins them. Texts on their way get their answers as usual.
   */
  bundleGone(): void {
    const open = this.open.value;
    if (!open) {
      return;
    }
    const draft = this.draft.value;
    batch(() => {
      this.close(open);
      if (draft !== toTyped(open.before ?? '')) {
        const reason = open.conflict ? conflictNotice(open) : (open.error ?? closedNotice());
        this.reject(open, draft, reason, open.conflict !== undefined);
      }
    });
  }

  /**
   * The texts that are not in the files, for the host to keep: those it did not write, and a typed text of the
   * open editor, which takes the place of a text that was not saved in its cell.
   */
  unsaved(): UnsavedText[] {
    const open = this.open.value;
    const typed = open && this.draft.value !== toTyped(open.before ?? '') ? open : undefined;
    const texts = [...this.rejected.value.values()]
      .filter((rejection) => !typed || !sameCell(rejection, typed))
      .map(({ entryId, locale, text, message, conflict }) => ({
        entryId,
        locale,
        text,
        message,
        shown: this.textOf({ entryId, locale }) ?? null,
        conflict,
      }));
    if (typed) {
      texts.push({
        entryId: typed.entryId,
        locale: typed.locale,
        text: this.draft.value,
        message: typed.error ?? closedNotice(),
        shown: typed.before ?? null,
        conflict: typed.conflict !== undefined,
      });
    }
    return texts;
  }

  /**
   * Brings the texts the host kept back into the cells the model has, as not saved; a cell that shows another
   * text than it did then makes its text a conflict. How many came back.
   */
  restore(texts: readonly UnsavedText[]): number {
    const rejected = new Map(this.rejected.value);
    let count = 0;
    for (const kept of texts) {
      const now = this.textOf(kept);
      if (!this.shows(kept) || now === kept.text) {
        continue;
      }
      const conflict = kept.conflict || (now ?? null) !== kept.shown;
      rejected.set(cellKey(kept), {
        entryId: kept.entryId,
        locale: kept.locale,
        text: kept.text,
        message: conflict ? conflictNotice(kept) : kept.message,
        conflict,
      });
      count++;
    }
    this.rejected.value = rejected;
    return count;
  }

  /** Starts afresh, e.g. when the webview loads again; the numbers of requests go on, so that none repeats. */
  reset(): void {
    this.model = undefined;
    batch(() => {
      this.open.value = null;
      this.pending.value = [];
      this.rejected.value = new Map();
    });
  }

  /**
   * The text of the open editor's cell changed outside it (another program, a merge): the draft stays, and the
   * editor offers to take the new text or keep the draft. Back to the text editing began with, there is none;
   * an editor that opened with a conflict does not know that text, so its choice stays until the user makes it.
   * While texts of the cell are on their way, their models are no conflict; the host checks them (B5).
   */
  private checkConflict(open: OpenEditor): void {
    if (this.pending.value.some((edit) => sameCell(edit, open))) {
      return;
    }
    const current = this.textOf(open);
    if (open.conflict && open.conflict.text === current) {
      return;
    }
    if (current === open.before && !open.conflict?.baseUnknown) {
      if (open.conflict) {
        this.open.value = { ...open, conflict: undefined };
      }
      return;
    }
    this.open.value = { ...open, conflict: { ...open.conflict, text: current } };
    this.announce(conflictNotice(open));
  }

  private send(cell: CellRef, value: string, before: string | undefined): void {
    const requestId = `edit-${++this.requests}`;
    const { entryId, locale } = cell;
    batch(() => {
      this.forget(cell);
      this.pending.value = [
        ...this.pending.value,
        { entryId, locale, requestId, value, before, written: false },
      ];
    });
    this.post({ type: 'edit', requestId, entryId, locale, value, before: before ?? null });
  }

  private reject(cell: CellRef, text: string, message: string, conflict: boolean): void {
    const { entryId, locale } = cell;
    this.rejected.value = new Map(this.rejected.value).set(cellKey(cell), {
      entryId,
      locale,
      text,
      message,
      conflict,
    });
  }

  /** Closes the editor; the text that was not saved in its cell is its own now, saved or given up with it. */
  private close(cell: CellRef): void {
    this.open.value = null;
    this.forget(cell);
  }

  private forget(cell: CellRef): void {
    const key = cellKey(cell);
    if (this.rejected.value.has(key)) {
      const rejected = new Map(this.rejected.value);
      rejected.delete(key);
      this.rejected.value = rejected;
    }
  }

  /** Whether the last model has the cell: its key and its language. */
  private shows(cell: CellRef): boolean {
    return (
      this.model !== undefined &&
      this.model.rows.some((row) => row.entryId === cell.entryId) &&
      this.model.locales.some((locale) => locale.code === cell.locale)
    );
  }

  /** The text a cell has in the last model. */
  private textOf(cell: CellRef): string | undefined {
    return this.model?.rows.find((row) => row.entryId === cell.entryId)?.cells[cell.locale]?.value;
  }
}

export function cellKey(cell: CellRef): string {
  return JSON.stringify([cell.entryId, cell.locale]);
}

function sameCell(a: CellRef, b: CellRef): boolean {
  return a.entryId === b.entryId && a.locale === b.locale;
}

function names(cell: CellRef): { key: string; locale: string } {
  return { key: displayKey(keyFromId(cell.entryId)), locale: cell.locale };
}

/** Why the text of an editor that closed before saving is not saved. */
function closedNotice(): string {
  return l10n.t('The editor closed before this text was saved.');
}

function conflictNotice(cell: CellRef): string {
  return l10n.t(
    '{key} in {locale} changed outside the editor. Take the new text, or keep yours.',
    names(cell),
  );
}

/** A text as a field holds it: browsers turn every line break of a text field into "\n". */
function toTyped(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** The typed text with the line breaks of the text it replaces, so that a file keeps its "\r\n" inside texts. */
function withLineBreaksOf(before: string | undefined, typed: string): string {
  return before?.includes('\r\n') ? typed.replace(/\r?\n/g, '\r\n') : typed;
}
