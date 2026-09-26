// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FILTER } from '../../../src/shared/filter';
import type { WebviewToHost } from '../../../src/shared/protocol';
import { findingsModel as model, openWith as open, row, text, axeProblems } from './support';

const id = (key: string) => JSON.stringify(key.split('.'));
const grid = () => screen.getByRole('grid', { name: 'common' });
const rowOf = (key: string) => within(grid()).getByRole('rowheader', { name: key }).parentElement!;
/** The cell of a key in a language column: de, de-informal, fr, it. */
const cellOf = (key: string, column: number) => within(rowOf(key)).getAllByRole('gridcell')[column]!;
const description = (element: Element) =>
  document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent;
/** The field of the open editor. */
const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => void fireEvent.keyDown(document.activeElement!, { key, ...init }));
const typeText = (value: string) => act(() => void fireEvent.input(field(), { target: { value } }));
const nextTask = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const edits = (posted: readonly WebviewToHost[]) =>
  posted.filter((message): message is Extract<WebviewToHost, { type: 'edit' }> => message.type === 'edit');
/** The id of the last text sent, which the host's answer names. */
const lastRequest = (posted: readonly WebviewToHost[]) => edits(posted).at(-1)!.requestId;
/** The text of SAVE in French, changed outside the editor. */
const saveInFrench = (value: string | undefined) => {
  const save = model.rows[0]!;
  return {
    type: 'patch' as const,
    patch: { rows: [{ ...save, cells: { ...save.cells, fr: text(value) } }] },
  };
};
const CONFLICT_NOTICE =
  'SAVE in fr wurde außerhalb des Editors geändert. Übernehmen Sie den neuen Text, oder behalten Sie Ihren.';

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  act(() => void window.dispatchEvent(new Event('resize')));
}

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
  setWidth(1024);
});
afterEach(cleanup);

describe('cell editor in the table', () => {
  it('opens with Enter, F2 or a click, named by key and language, with the focus in it', () => {
    open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    expect(field()).toBe(screen.getByRole('textbox', { name: 'SAVE in fr' }));
    expect(field().value).toBe('Enregistrer');
    expect(field().getAttribute('lang')).toBe('fr');
    expect(document.activeElement).toBe(field());
    press('Escape');
    press('F2');
    expect(document.activeElement).toBe(field());
    press('Escape');
    act(() => void fireEvent.click(cellOf('CANCEL', 0)));
    expect(field().value).toBe('Abbrechen');
    expect(document.activeElement).toBe(field());
    expect(description(grid())).toBe(
      'Ein Klick, Enter oder F2 bearbeitet einen Text; in der Key-Spalte benennt F2 den Key um, Entf (auf dem Mac Cmd+Rücktaste) löscht ihn.',
    );
  });

  it('leaves a click with Shift, Ctrl, Alt or Cmd, or one that ends a text selection, to select', () => {
    open();
    for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
      act(() => void fireEvent.click(cellOf('CANCEL', 0), { [modifier]: true }));
    }
    const range = document.createRange();
    range.selectNodeContents(cellOf('CANCEL', 2));
    document.getSelection()!.addRange(range);
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    document.getSelection()!.removeAllRanges();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps a click in the open editor there, and saves it when another cell is clicked', () => {
    const { posted } = open();
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    const opened = field();
    typeText('Annuler!');
    act(() => void fireEvent.click(opened));
    expect(field()).toBe(opened);
    expect(field().value).toBe('Annuler!');
    // A click to place the caret saves nothing in the middle of typing.
    expect(edits(posted)).toEqual([]);
    act(() => void fireEvent.click(cellOf('SAVE', 2)));
    expect(field()).toBe(screen.getByRole('textbox', { name: 'SAVE in fr' }));
    expect(edits(posted)).toEqual([
      expect.objectContaining({ entryId: id('CANCEL'), locale: 'fr', value: 'Annuler!' }),
    ]);
  });

  it('opens the cell the key was pressed in, even before the grid has caught up with the focus', () => {
    open();
    act(() => {
      cellOf('SAVE', 2).focus();
      fireEvent.keyDown(cellOf('SAVE', 2), { key: 'Enter' });
    });
    expect(field()).toBe(screen.getByRole('textbox', { name: 'SAVE in fr' }));
  });

  it('saves with Enter: sends the text, shows it at once and gives the focus back to the cell', () => {
    const { posted } = open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('Sauvegarder');
    press('Enter');
    expect(posted.at(-1)).toEqual({
      type: 'edit',
      requestId: expect.any(String),
      entryId: id('SAVE'),
      locale: 'fr',
      value: 'Sauvegarder',
      before: 'Enregistrer',
    });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(cellOf('SAVE', 2).textContent).toBe('Sauvegarder');
    expect(document.activeElement).toBe(cellOf('SAVE', 2));
  });

  it('cancels with Esc: sends nothing and keeps the text', () => {
    const { posted } = open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('Sauvegarder');
    press('Escape');
    expect(edits(posted)).toEqual([]);
    expect(cellOf('SAVE', 2).textContent).toBe('Enregistrer');
    expect(document.activeElement).toBe(cellOf('SAVE', 2));
  });

  it('saves with Tab and goes on to the next cell, with Shift+Tab to the previous one', () => {
    const { posted } = open();
    act(() => cellOf('SAVE', 3).focus());
    press('Enter');
    typeText('Salvare');
    press('Tab');
    expect(field()).toBe(screen.getByRole('textbox', { name: 'CANCEL in de' }));
    expect(document.activeElement).toBe(field());
    press('Tab', { shiftKey: true });
    expect(field()).toBe(screen.getByRole('textbox', { name: 'SAVE in it' }));
    expect(field().value).toBe('Salvare');
    expect(edits(posted)).toHaveLength(1);
  });

  it('keeps Enter for new lines in a text of several lines, which Ctrl+Enter saves', () => {
    const lines = row('MAIL', {
      de: text('Hallo\nWelt'),
      'de-informal': text(undefined),
      fr: text('Bonjour\nmonde'),
      it: text(undefined),
    });
    const { posted } = open({}, { ...model, rows: [lines, ...model.rows] });
    act(() => cellOf('MAIL', 2).focus());
    press('Enter');
    expect(fireEvent.keyDown(field(), { key: 'Enter' })).toBe(true);
    typeText('Bonjour\ntout le monde');
    press('Enter', { ctrlKey: true });
    expect(edits(posted)).toEqual([expect.objectContaining({ value: 'Bonjour\ntout le monde' })]);

    // In a text of one line, Shift+Enter is left to the field, which starts a new line.
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    expect(fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true })).toBe(true);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('leaves the keys to the field while typing: they neither move the focus nor are held back', () => {
    open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    for (const key of ['ArrowDown', 'Home', ' ', 'PageDown']) {
      expect(fireEvent.keyDown(field(), { key }), key).toBe(true);
    }
    expect(fireEvent.keyDown(field(), { key: 'ArrowDown', altKey: true })).toBe(true);
    expect(document.activeElement).toBe(field());
  });

  it('does not save while an input method is composing a word', () => {
    const { posted } = open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('保存');
    press('Enter', { isComposing: true });
    expect(edits(posted)).toEqual([]);
    expect(document.activeElement).toBe(field());
  });

  it('saves when the focus goes to another control, not when VS Code takes it from the editor', async () => {
    const { posted } = open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('Sauver');
    // VS Code takes the focus: the field stays the active element of the page and gets it back later. The editor
    // listens to focusout, which a blur event alone would never reach (audit T-02).
    act(() => void fireEvent.focusOut(field()));
    expect(document.activeElement).toBe(field());
    await nextTask();
    expect(edits(posted)).toEqual([]);
    expect(screen.getByRole('textbox')).toBeTruthy();

    act(() => screen.getByRole('searchbox').focus());
    await nextTask();
    expect(edits(posted)).toEqual([expect.objectContaining({ value: 'Sauver' })]);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows the old text again when saving fails, marks the cell and brings the typed text back', () => {
    const { store, send, posted } = open();
    act(() => cellOf('CANCEL', 0).focus());
    press('Enter');
    typeText('Abbruch');
    press('Enter');
    const message = 'CANCEL in de wurde zwischenzeitlich geändert.';
    send({ type: 'writeResult', requestId: lastRequest(posted), ok: false, message });
    expect(cellOf('CANCEL', 0).textContent).toBe('Abbrechen ✖ nicht gespeichert');
    expect(description(cellOf('CANCEL', 0))).toBe(`Nicht gespeichert: ${message}`);
    expect(store.announcement.value.text).toBe(`CANCEL in de: nicht gespeichert. ${message}`);

    press('Enter');
    expect(field().value).toBe('Abbruch');
    const error = document.getElementById('cell-editor-error')!;
    expect(error.textContent).toBe(`✖ Nicht gespeichert: ${message}`);
    expect(field().getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
  });

  it('takes a failure into the editor when the text is edited again meanwhile', () => {
    const { send, posted } = open();
    act(() => cellOf('CANCEL', 0).focus());
    press('Enter');
    typeText('Abbruch');
    press('Enter');
    press('Enter');
    typeText('Abbruch!');
    const message = 'Die Datei ist schreibgeschützt.';
    send({ type: 'writeResult', requestId: lastRequest(posted), ok: false, message });
    expect(field().value).toBe('Abbruch!');
    expect(document.getElementById('cell-editor-error')!.textContent).toBe(`✖ Nicht gespeichert: ${message}`);
    expect(document.activeElement).toBe(field());
    press('Enter');
    expect(posted.at(-1)).toMatchObject({ type: 'edit', value: 'Abbruch!', before: 'Abbrechen' });
  });

  it('shows a change of its text outside the editor, with the choice to take it or keep the draft', async () => {
    const { send, posted } = open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('Sauver');
    send(saveInFrench('Sauvegarder'));
    const conflict = document.getElementById('cell-editor-conflict')!;
    expect(conflict.textContent).toContain('Außerhalb des Editors geändert: Sauvegarder');
    expect(field().getAttribute('aria-describedby')?.split(' ')).toContain(conflict.id);
    expect(within(conflict).getByText('Sauvegarder').getAttribute('lang')).toBe('fr');
    expect(field().value).toBe('Sauver');
    expect(await axeProblems()).toEqual([]);
    // Tab leads to the choice instead of saving.
    expect(fireEvent.keyDown(field(), { key: 'Tab' })).toBe(true);
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Meinen Text behalten' })));
    expect(document.getElementById('cell-editor-conflict')).toBeNull();
    expect(document.activeElement).toBe(field());
    press('Enter');
    expect(posted.at(-1)).toMatchObject({ type: 'edit', value: 'Sauver', before: 'Sauvegarder' });
  });

  it('leads Enter to the choice in a conflict, sends nothing, and Esc gives up the draft', () => {
    const { send, posted } = open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('Sauver');
    send(saveInFrench('Sauvegarder'));
    expect(document.getElementById('cell-editor-hint')!.textContent).toBe(
      'Tab führt zur Wahl zwischen dem neuen Text und Ihrem; Esc verwirft Ihren.',
    );
    press('Enter');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Neuen Text übernehmen' }));
    press('Escape');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(edits(posted)).toEqual([]);
    expect(cellOf('SAVE', 2).textContent).toBe('Sauvegarder');
    expect(document.activeElement).toBe(cellOf('SAVE', 2));
  });

  it('gives the focus back to the field when the choice goes, once the text is back as it was', () => {
    const { send } = open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('Sauver');
    send(saveInFrench('Sauvegarder'));
    press('Enter');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Neuen Text übernehmen' }));
    send(saveInFrench('Enregistrer'));
    expect(document.getElementById('cell-editor-conflict')).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it('keeps the choice when a model for another key comes', async () => {
    const { send } = open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('Sauver');
    send(saveInFrench('Sauvegarder'));
    act(() => screen.getByRole('searchbox').focus());
    await nextTask();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    press('Enter');
    const cancel = model.rows[1]!;
    send({
      type: 'patch',
      patch: { rows: [{ ...cancel, cells: { ...cancel.cells, fr: text('Annuler') } }] },
    });
    expect(document.getElementById('cell-editor-conflict')).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Neuen Text übernehmen' }));
  });

  it('keeps the draft of a conflict as not saved when the focus leaves, and offers the choice again', async () => {
    const { store, send, posted } = open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('Sauver');
    send(saveInFrench('Sauvegarder'));
    act(() => screen.getByRole('searchbox').focus());
    await nextTask();
    expect(edits(posted)).toEqual([]);
    expect(cellOf('SAVE', 2).textContent).toBe('Sauvegarder ✖ nicht gespeichert');
    expect(store.announcement.value.text).toBe(`SAVE in fr: nicht gespeichert. ${CONFLICT_NOTICE}`);
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    expect(field().value).toBe('Sauver');
    expect(document.getElementById('cell-editor-conflict')!.textContent).toContain('Sauvegarder');
  });

  it('says while typing how placeholders and tags compare with the reference', () => {
    open();
    act(() => cellOf('ERROR_TITLE', 2).focus());
    press('Enter');
    const check = document.getElementById('cell-editor-check')!;
    expect(check.getAttribute('role')).toBe('status');
    // The symbols are hidden from screen readers, which read the severity instead.
    expect(check.textContent).toBe(
      '✖ Fehler: Fehlende Platzhalter: {{date}}✖ Fehler: Platzhalter, die die Referenz nicht hat: {{data}}',
    );
    typeText('Erreur ({{date}})');
    expect(check.textContent).toBe('✓ Platzhalter und HTML-Tags wie in der Referenz.');
    expect(field().getAttribute('aria-describedby')?.split(' ')).toContain(check.id);
  });

  it('tells which keys save: Enter for a text of one line, Ctrl+Enter for one of several', () => {
    open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    const hint = document.getElementById('cell-editor-hint')!;
    expect(hint.textContent).toBe(
      'Enter speichert · Umschalt+Enter: neue Zeile · Tab: speichern und weiter · Esc: abbrechen',
    );
    expect(field().getAttribute('aria-describedby')?.split(' ')).toContain(hint.id);
  });

  it('offers no editor in the key column or the header row', () => {
    open();
    act(() => within(rowOf('SAVE')).getByRole('rowheader').focus());
    press('Enter');
    act(() => within(grid()).getByRole('columnheader', { name: 'fr' }).focus());
    press('F2');
    act(() => void fireEvent.click(within(grid()).getByRole('columnheader', { name: 'fr' })));
    act(() => void fireEvent.click(within(rowOf('SAVE')).getByRole('rowheader')));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('has no accessibility violations while a text is edited', async () => {
    open({ wrap: true });
    act(() => cellOf('ERROR_TITLE', 2).focus());
    press('Enter');
    expect(await axeProblems()).toEqual([]);
  });
});

describe('cell editor in the list', () => {
  const cardOf = (key: string) =>
    within(screen.getByRole('list', { name: 'common' }))
      .getByRole('heading', { level: 2, name: key })
      .closest('li')!;

  it('opens from the text of a field, a button named by language and text; the focus comes back to it', () => {
    setWidth(600);
    const { posted } = open();
    act(() => void fireEvent.click(within(cardOf('SAVE')).getByRole('button', { name: 'fr: Enregistrer' })));
    expect(document.activeElement).toBe(field());
    typeText('Sauver');
    press('Enter');
    expect(posted.at(-1)).toMatchObject({ type: 'edit', value: 'Sauver', before: 'Enregistrer' });
    expect(document.activeElement).toBe(within(cardOf('SAVE')).getByRole('button', { name: 'fr: Sauver' }));
    expect(
      within(cardOf('CANCEL')).getByRole('button', { name: 'de-informal: kein eigener Text' }),
    ).toBeTruthy();
  });

  it('goes on with Tab to the next language, then to the first of the next card', () => {
    setWidth(600);
    open();
    act(() => void fireEvent.click(within(cardOf('SAVE')).getByRole('button', { name: 'it: Salva' })));
    press('Tab');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'CANCEL in de' }));
  });

  it('keeps its place when the card with the focus goes, e.g. once its missing text is there', () => {
    setWidth(600);
    const { send } = open({ filter: { ...DEFAULT_FILTER, status: 'missing' } });
    act(() => within(cardOf('CANCEL')).getByRole('button', { name: /^fr: / }).focus());
    const rows = model.rows.map((candidate) =>
      candidate.key === 'CANCEL'
        ? { ...candidate, cells: { ...candidate.cells, fr: text('Annuler') } }
        : candidate,
    );
    send({ type: 'bundle', model: { ...model, rows } });
    expect(document.activeElement).toBe(within(cardOf('ERROR_TITLE')).getByRole('button', { name: /^fr: / }));
  });

  it('does not take the focus back after it left the list', async () => {
    setWidth(600);
    const { send } = open({ filter: { ...DEFAULT_FILTER, status: 'missing' } });
    const withText = (key: string, code: string) =>
      model.rows.map((candidate) =>
        candidate.key === key
          ? { ...candidate, cells: { ...candidate.cells, [code]: text('x') } }
          : candidate,
      );
    act(() => within(cardOf('CANCEL')).getByRole('button', { name: /^fr: / }).focus());
    // The focus goes to a control outside, which goes too (e.g. the choice of the compact list).
    const outside = document.body.appendChild(document.createElement('button'));
    act(() => outside.focus());
    outside.remove();
    send({ type: 'bundle', model: { ...model, rows: withText('CANCEL', 'fr') } });
    expect(document.activeElement).toBe(document.body);

    // A click beside the controls: the focus goes to the page.
    act(() => within(cardOf('ERROR_TITLE')).getByRole('button', { name: /^it: / }).focus());
    act(() => (document.activeElement as HTMLElement).blur());
    await Promise.resolve();
    send({ type: 'bundle', model: { ...model, rows: withText('ERROR_TITLE', 'it') } });
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the focus on the text when its button to delete it goes, deleted or not', () => {
    setWidth(600);
    const { send, posted } = open();
    const textOf = () => within(cardOf('WORKSPACE.TITLE')).getByRole('button', { name: /^it: / });
    act(
      () => void fireEvent.click(screen.getByRole('button', { name: 'Text löschen WORKSPACE.TITLE in it' })),
    );
    expect(edits(posted)).toEqual([expect.objectContaining({ locale: 'it', value: '' })]);
    expect(screen.queryByRole('button', { name: /^Text löschen/ })).toBeNull();
    expect(document.activeElement).toBe(textOf());
    // The user declined in the host's question: the empty text is back, and its button.
    send({ type: 'writeResult', requestId: lastRequest(posted), ok: false });
    expect(screen.getByRole('button', { name: /^Text löschen/ })).toBeTruthy();
    expect(document.activeElement).toBe(textOf());
  });

  it('keeps the card whose editor closed, also beyond the cards shown so far', () => {
    setWidth(600);
    const keys = Array.from({ length: 250 }, (_, index) => `K${String(index).padStart(3, '0')}`);
    const rows = keys.map((key) =>
      row(key, {
        de: text(`${key} de`),
        'de-informal': text(undefined),
        fr: text(`${key} fr`),
        it: text(''),
      }),
    );
    open({}, { ...model, rows });
    act(() => void fireEvent.click(within(cardOf('K199')).getByRole('button', { name: /^it: / })));
    press('Tab');
    expect(field()).toBe(screen.getByRole('textbox', { name: 'K200 in de' }));
    press('Escape');
    expect(document.activeElement).toBe(within(cardOf('K200')).getByRole('button', { name: 'de: K200 de' }));
  });

  it('keeps the editor and its text when the table gives way to the list', () => {
    open();
    act(() => cellOf('SAVE', 2).focus());
    press('Enter');
    typeText('Sauver');
    setWidth(600);
    expect(screen.queryByRole('grid')).toBeNull();
    expect(field().value).toBe('Sauver');
    expect(document.activeElement).toBe(field());
  });

  it('has no accessibility violations while a text is edited', async () => {
    setWidth(600);
    open();
    act(() => void fireEvent.click(within(cardOf('ERROR_TITLE')).getByRole('button', { name: /^fr: / })));
    expect(await axeProblems()).toEqual([]);
  });
});
