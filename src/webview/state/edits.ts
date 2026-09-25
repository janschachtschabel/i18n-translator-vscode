import { batch, signal } from '@preact/signals';
import { displayKey, keyFromId } from '../../core/model/keys';
import type { HostToWebview, WebviewToHost } from '../../shared/protocol';
import type { BundleViewModel, CellView, LocaleView, RowView } from '../../shared/viewModel';
import { l10n } from '../l10n';

/** A text of the bundle: a key in a language. */
export interface CellRef {
  entryId: string;
  locale: string;
}

/** The cell whose editor is open. */
export interface OpenEditor extends CellRef {
  /** The text the cell showed when editing began (undefined: none); the host compares it with the file (B5). */
  before: string | undefined;
  /** Why the text the editor starts with was not saved before, if it was not. */
  error: string | undefined;
}

/** A text sent to the host. */
export interface PendingEdit extends CellRef {
  requestId: string;
  value: string;
  /** The host wrote it; the next model has it. */
  written: boolean;
}

/** A text the host did not write, kept so that editing its cell again brings it back. */
export interface Rejection extends CellRef {
  text: string;
  message: string;
}

/** A cell as the editor shows it. */
export interface ShownCell extends CellView {
  /** Why the text typed for this cell was not saved. */
  notSaved?: string;
}

export interface ShownRow extends RowView {
  cells: Readonly<Record<string, ShownCell>>;
}

type WriteResult = Extract<HostToWebview, { type: 'writeResult' }>;

/** What editing changed in a cell: a text sent (undefined: cleared), and why a text was not saved. */
interface CellChange {
  sent?: string | undefined;
  notSaved?: string;
}

const NO_TEXT: CellView = { value: undefined, issues: [] };

/**
 * The editing of texts: the open editor, the texts on their way to the files and those the host did not write.
 * The host has the truth (B1); the rows show a sent text at once, and the old one again if writing fails.
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

  constructor(
    private readonly post: (message: WebviewToHost) => void,
    private readonly announce: (text: string) => void,
  ) {}

  /** Opens the editor of a cell that shows `shown`, with the text that was not saved there, if there is one. */
  start(cell: CellRef, shown: string | undefined): void {
    this.commit();
    const rejection = this.rejected.value.get(cellKey(cell));
    batch(() => {
      this.open.value = {
        entryId: cell.entryId,
        locale: cell.locale,
        before: shown,
        error: rejection?.message,
      };
      this.draft.value = rejection?.text ?? shown ?? '';
    });
  }

  /** Closes the editor and sends its text, unless it is the one the cell showed. */
  commit(): void {
    const open = this.open.value;
    if (!open) {
      return;
    }
    const value = this.draft.value;
    batch(() => {
      this.close(open);
      if (value === (open.before ?? '')) {
        return;
      }
      const requestId = `edit-${++this.requests}`;
      const { entryId, locale } = open;
      this.pending.value = [...this.pending.value, { entryId, locale, requestId, value, written: false }];
      this.post({ type: 'edit', requestId, entryId, locale, value, before: open.before ?? null });
    });
  }

  /** Closes the editor without sending its text; a text that was not saved in its cell is given up too. */
  cancel(): void {
    const open = this.open.value;
    if (open) {
      this.close(open);
    }
  }

  /** Takes the host's answer to a sent text. Without a message the user kept the old text (e.g. declined to clear). */
  answer({ requestId, ok, message }: WriteResult): void {
    const edit = this.pending.value.find((candidate) => candidate.requestId === requestId);
    if (ok) {
      if (edit) {
        this.pending.value = this.pending.value.map((candidate) =>
          candidate === edit ? { ...candidate, written: true } : candidate,
        );
      }
      this.announce(l10n.t('Saved.'));
      return;
    }
    batch(() => {
      if (edit) {
        this.pending.value = this.pending.value.filter((candidate) => candidate !== edit);
        if (message !== undefined) {
          const { entryId, locale, value } = edit;
          this.rejected.value = new Map(this.rejected.value).set(cellKey(edit), {
            entryId,
            locale,
            text: value,
            message,
          });
        }
      }
    });
    if (message !== undefined) {
      this.announce(l10n.t('Not saved: {message}', { message }));
    }
  }

  /**
   * Takes a new model: it has the texts that were written. A text for a key or a language it no longer has
   * cannot be saved, so its editor closes and its mark goes.
   */
  update(model: BundleViewModel): void {
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
          l10n.t('{key} is no longer in this bundle; the text you typed was not saved.', {
            key: displayKey(keyFromId(open.entryId)),
          }),
        );
      }
    });
  }

  /** Starts afresh, e.g. when the webview loads again; answers to earlier texts are still announced. */
  reset(): void {
    batch(() => {
      this.open.value = null;
      this.pending.value = [];
      this.rejected.value = new Map();
    });
  }

  private close(cell: CellRef): void {
    this.open.value = null;
    const key = cellKey(cell);
    if (this.rejected.value.has(key)) {
      const rejected = new Map(this.rejected.value);
      rejected.delete(key);
      this.rejected.value = rejected;
    }
  }
}

export function cellKey(cell: CellRef): string {
  return JSON.stringify([cell.entryId, cell.locale]);
}

/**
 * The rows with the texts on their way to the files and the marks of texts that were not saved. A sent text
 * takes the place of its cell, without the findings of the old text, until the model has it. Rows without
 * either stay the same objects, so that only the changed ones render again.
 */
export function showEdits(
  rows: readonly RowView[],
  pending: readonly PendingEdit[],
  rejected: ReadonlyMap<string, Rejection>,
): readonly ShownRow[] {
  if (pending.length === 0 && rejected.size === 0) {
    return rows;
  }
  const changes = new Map<string, Map<string, CellChange>>();
  const changeOf = (cell: CellRef): CellChange => {
    let row = changes.get(cell.entryId);
    if (!row) {
      row = new Map();
      changes.set(cell.entryId, row);
    }
    let change = row.get(cell.locale);
    if (!change) {
      change = {};
      row.set(cell.locale, change);
    }
    return change;
  };
  for (const edit of pending) {
    // A later text for the same cell replaces an earlier one. Clearing deletes the text (B2): none is left.
    changeOf(edit).sent = edit.value === '' ? undefined : edit.value;
  }
  for (const rejection of rejected.values()) {
    changeOf(rejection).notSaved = rejection.message;
  }
  return rows.map((row) => {
    const cells = changes.get(row.entryId);
    if (!cells) {
      return row;
    }
    const shown: Record<string, ShownCell> = { ...row.cells };
    for (const [locale, change] of cells) {
      const cell = row.cells[locale] ?? NO_TEXT;
      const sent = 'sent' in change && change.sent !== cell.value ? { value: change.sent, issues: [] } : cell;
      shown[locale] = change.notSaved === undefined ? sent : { ...sent, notSaved: change.notSaved };
    }
    return { ...row, cells: shown };
  });
}

/** The cell after (1) or before (-1) `from` in reading order: along its row, then on to the next row. */
export function nextCell(
  rows: readonly RowView[],
  locales: readonly LocaleView[],
  from: CellRef,
  direction: 1 | -1,
): CellRef | undefined {
  const row = rows.findIndex((candidate) => candidate.entryId === from.entryId);
  const column = locales.findIndex((locale) => locale.code === from.locale);
  if (row === -1 || column === -1) {
    return undefined;
  }
  const index = row * locales.length + column + direction;
  if (index < 0 || index >= rows.length * locales.length) {
    return undefined;
  }
  return {
    entryId: rows[Math.floor(index / locales.length)]!.entryId,
    locale: locales[index % locales.length]!.code,
  };
}
