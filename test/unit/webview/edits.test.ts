// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_STATE, type WebviewToHost } from '../../../src/shared/protocol';
import type { BundleViewModel, RowView } from '../../../src/shared/viewModel';
import { nextCell, showEdits, type PendingEdit, type Rejection } from '../../../src/webview/state/edits';
import { EditorStore } from '../../../src/webview/state/store';
import { findingsModel as model, GERMAN, locale, panelState, row, text } from './support';

const id = (key: string) => JSON.stringify(key.split('.'));

/** A store that shows the bundle of the tests in German, and what it sends to the host. */
function open(uiState = DEFAULT_UI_STATE) {
  const posted: WebviewToHost[] = [];
  const store = new EditorStore({
    postMessage: (message) => void posted.push(message),
    setState: () => undefined,
  });
  store.receive({ type: 'init', l10n: GERMAN, uiState, panelState });
  store.receive({ type: 'bundle', model });
  const edits = () => posted.filter((message) => message.type === 'edit');
  const cell = (key: string, code: string) =>
    store.rows.value.find((candidate) => candidate.key === key)!.cells[code]!;
  /** Edits a cell as the user would: opens it, types `value`, saves. */
  const type = (key: string, code: string, value: string) => {
    store.edit(id(key), code);
    store.edits.draft.value = value;
    store.edits.commit();
  };
  return { store, edits, cell, type };
}

/** The bundle of the tests with other texts in some cells. */
function withTexts(changes: Record<string, Record<string, RowView['cells'][string]>>): BundleViewModel {
  return {
    ...model,
    rows: model.rows.map((candidate) =>
      changes[candidate.key]
        ? { ...candidate, cells: { ...candidate.cells, ...changes[candidate.key] } }
        : candidate,
    ),
  };
}

describe('editing', () => {
  it('sends the typed text with the text the cell showed: none (null), an empty one or a text', () => {
    const { edits, type } = open();
    type('SAVE', 'fr', 'Sauvegarder');
    type('SAVE', 'de-informal', 'Speichere');
    type('WORKSPACE.TITLE', 'it', 'Area di lavoro');
    expect(edits()).toEqual([
      expect.objectContaining({
        entryId: id('SAVE'),
        locale: 'fr',
        value: 'Sauvegarder',
        before: 'Enregistrer',
      }),
      expect.objectContaining({
        entryId: id('SAVE'),
        locale: 'de-informal',
        value: 'Speichere',
        before: null,
      }),
      expect.objectContaining({ locale: 'it', value: 'Area di lavoro', before: '' }),
    ]);
    expect(new Set(edits().map((edit) => (edit as { requestId: string }).requestId)).size).toBe(3);
  });

  it('sends nothing when the text did not change, and closes the editor', () => {
    const { store, edits, type } = open();
    type('SAVE', 'fr', 'Enregistrer');
    type('SAVE', 'de-informal', '');
    expect(edits()).toEqual([]);
    expect(store.edits.open.value).toBeNull();
  });

  it('shows a sent text at once, without the findings of the old one, until the model has it', () => {
    const { store, cell, type } = open();
    type('ERROR_TITLE', 'fr', 'Erreur ({{date}})');
    expect(cell('ERROR_TITLE', 'fr')).toEqual({ value: 'Erreur ({{date}})', issues: [] });
    store.receive({ type: 'writeResult', requestId: 'edit-1', ok: true });
    expect(store.announcement.value.text).toBe('Gespeichert.');
    expect(cell('ERROR_TITLE', 'fr').value).toBe('Erreur ({{date}})');

    // The model with the written text; a later one shows what the files have then.
    store.receive({ type: 'bundle', model: withTexts({ ERROR_TITLE: { fr: text('Erreur ({{date}})') } }) });
    store.receive({ type: 'bundle', model: withTexts({ ERROR_TITLE: { fr: text('Erreur du {{date}}') } }) });
    expect(cell('ERROR_TITLE', 'fr').value).toBe('Erreur du {{date}}');
  });

  it('shows the findings of the new model even if it comes before the answer', () => {
    const { store, cell, type } = open();
    type('SAVE', 'fr', 'Sauver {{x}}');
    const mismatch = text('Sauver {{x}}', 'placeholder-mismatch');
    store.receive({ type: 'bundle', model: withTexts({ SAVE: { fr: mismatch } }) });
    expect(cell('SAVE', 'fr')).toEqual(mismatch);
    store.receive({ type: 'writeResult', requestId: 'edit-1', ok: true });
    expect(cell('SAVE', 'fr')).toEqual(mismatch);
  });

  it('shows no text for a cleared one, which the host deletes so that the fallback applies', () => {
    const { cell, type } = open();
    type('SAVE', 'fr', '');
    expect(cell('SAVE', 'fr').value).toBeUndefined();
  });

  it('shows the old text again when writing fails, marks the cell and keeps the typed text', () => {
    const { store, cell, type } = open();
    type('CANCEL', 'de', 'Abbruch');
    store.receive({
      type: 'writeResult',
      requestId: 'edit-1',
      ok: false,
      message: 'CANCEL in de wurde zwischenzeitlich geändert.',
    });
    expect(cell('CANCEL', 'de')).toEqual({
      value: 'Abbrechen',
      issues: [],
      notSaved: 'CANCEL in de wurde zwischenzeitlich geändert.',
    });
    expect(store.announcement.value.text).toBe(
      'Nicht gespeichert: CANCEL in de wurde zwischenzeitlich geändert.',
    );

    store.edit(id('CANCEL'), 'de');
    expect(store.edits.draft.value).toBe('Abbruch');
    expect(store.edits.open.value).toEqual({
      entryId: id('CANCEL'),
      locale: 'de',
      before: 'Abbrechen',
      error: 'CANCEL in de wurde zwischenzeitlich geändert.',
      place: 'rows',
    });
    store.edits.cancel();
    expect(cell('CANCEL', 'de').notSaved).toBeUndefined();
  });

  it('gives the text back without a mark when the user decided to keep it', () => {
    const { store, cell, type } = open();
    type('SAVE', 'fr', '');
    store.receive({ type: 'writeResult', requestId: 'edit-1', ok: false });
    expect(cell('SAVE', 'fr')).toEqual(model.rows[0]!.cells['fr']);
    expect(store.announcement.value.text).toBe('');
  });

  it('closes the editor of a key that went, says that its text was not saved, and drops its marks', () => {
    const { store, type } = open();
    type('CANCEL', 'de', 'Abbruch');
    store.receive({ type: 'writeResult', requestId: 'edit-1', ok: false, message: 'Geändert.' });
    store.edit(id('CANCEL'), 'fr');
    store.receive({
      type: 'bundle',
      model: { ...model, rows: model.rows.filter((candidate) => candidate.key !== 'CANCEL') },
    });
    expect(store.edits.open.value).toBeNull();
    expect(store.announcement.value.text).toBe(
      'CANCEL ist nicht mehr in dieser Einheit; der eingegebene Text wurde nicht gespeichert.',
    );
    expect(store.edits.rejected.value.size).toBe(0);
  });

  it('saves the open editor before the view changes', () => {
    const { store, edits } = open();
    store.edit(id('SAVE'), 'fr');
    store.edits.draft.value = 'Sauver';
    store.toggleMissing();
    expect(edits()).toEqual([expect.objectContaining({ value: 'Sauver' })]);
    expect(store.edits.open.value).toBeNull();
  });

  it('saves and opens the next cell in reading order, and says when there is none', () => {
    const { store, edits } = open();
    store.edit(id('SAVE'), 'it');
    store.edits.draft.value = 'Salvare';
    expect(store.editNext(1)).toBe(true);
    expect(store.edits.open.value).toMatchObject({
      entryId: id('CANCEL'),
      locale: 'de',
      before: 'Abbrechen',
    });
    expect(store.editNext(-1)).toBe(true);
    expect(store.edits.open.value).toMatchObject({ entryId: id('SAVE'), locale: 'it', before: 'Salvare' });
    store.edit(id('ERROR_TITLE'), 'it');
    expect(store.editNext(1)).toBe(false);
    expect(store.edits.open.value).toBeNull();
    expect(edits()).toHaveLength(1);
  });

  it('deletes an empty text, which hides the fallback, although editing cannot clear it', () => {
    const { store, edits, cell } = open();
    store.deleteText(id('WORKSPACE.TITLE'), 'it');
    expect(edits()).toEqual([
      expect.objectContaining({ entryId: id('WORKSPACE.TITLE'), locale: 'it', value: '', before: '' }),
    ]);
    expect(cell('WORKSPACE.TITLE', 'it').value).toBeUndefined();
  });

  it('goes on in the details along the languages of their key, all of them, and stops at the last', () => {
    const { store } = open({ ...DEFAULT_UI_STATE, hiddenLocales: ['fr'] });
    store.edit(id('SAVE'), 'de-informal', 'details');
    expect(store.editNext(1)).toBe(true);
    expect(store.edits.open.value).toMatchObject({ entryId: id('SAVE'), locale: 'fr', place: 'details' });
    store.edit(id('SAVE'), 'it', 'details');
    expect(store.editNext(1)).toBe(false);
  });

  it('starts afresh when the webview loads again', () => {
    const { store, cell, type } = open();
    type('SAVE', 'fr', 'Sauver');
    store.edit(id('CANCEL'), 'fr');
    store.receive({ type: 'init', l10n: GERMAN, uiState: DEFAULT_UI_STATE, panelState });
    store.receive({ type: 'bundle', model });
    expect(store.edits.open.value).toBeNull();
    expect(cell('SAVE', 'fr').value).toBe('Enregistrer');
  });
});

describe('showEdits', () => {
  const rows = [row('A', { de: text('a'), fr: text('b', 'same-as-reference') }), row('B', { de: text('c') })];
  const pending = (value: string, requestId = 'r1'): PendingEdit => ({
    requestId,
    entryId: id('A'),
    locale: 'fr',
    value,
    written: false,
  });

  it('keeps the rows, and every row without an edit, as they are', () => {
    expect(showEdits(rows, [], new Map())).toBe(rows);
    const shown = showEdits(rows, [pending('x')], new Map());
    expect(shown[0]).not.toBe(rows[0]);
    expect(shown[1]).toBe(rows[1]);
  });

  it('shows the latest text sent for a cell', () => {
    const shown = showEdits(rows, [pending('x'), pending('y', 'r2')], new Map());
    expect(shown[0]!.cells['fr']).toEqual({ value: 'y', issues: [] });
    expect(shown[0]!.cells['de']).toBe(rows[0]!.cells['de']);
  });

  it('marks a cell whose text was not saved, with the text and findings of the model', () => {
    const rejected = new Map<string, Rejection>([
      ['k', { entryId: id('A'), locale: 'fr', text: 'x', message: 'Nicht gespeichert.' }],
    ]);
    expect(showEdits(rows, [], rejected)[0]!.cells['fr']).toEqual({
      ...rows[0]!.cells['fr'],
      notSaved: 'Nicht gespeichert.',
    });
  });
});

describe('nextCell', () => {
  const rows = [row('A', {}), row('B', {})];
  const locales = [locale('de'), locale('fr')];

  it('goes along the row, then on to the next one, and stops at the ends', () => {
    expect(nextCell(rows, locales, { entryId: id('A'), locale: 'de' }, 1)).toEqual({
      entryId: id('A'),
      locale: 'fr',
    });
    expect(nextCell(rows, locales, { entryId: id('A'), locale: 'fr' }, 1)).toEqual({
      entryId: id('B'),
      locale: 'de',
    });
    expect(nextCell(rows, locales, { entryId: id('B'), locale: 'de' }, -1)).toEqual({
      entryId: id('A'),
      locale: 'fr',
    });
    expect(nextCell(rows, locales, { entryId: id('B'), locale: 'fr' }, 1)).toBeUndefined();
    expect(nextCell(rows, locales, { entryId: id('A'), locale: 'de' }, -1)).toBeUndefined();
  });

  it('knows no next cell of one that is not shown', () => {
    expect(nextCell(rows, locales, { entryId: id('C'), locale: 'de' }, 1)).toBeUndefined();
    expect(nextCell(rows, locales, { entryId: id('A'), locale: 'it' }, 1)).toBeUndefined();
  });
});
