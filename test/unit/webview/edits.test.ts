// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_STATE, type WebviewToHost } from '../../../src/shared/protocol';
import type { BundleViewModel, RowView } from '../../../src/shared/viewModel';
import type { PendingEdit, Rejection } from '../../../src/webview/state/edits';
import { nextCell } from '../../../src/webview/state/navigation';
import { showEdits } from '../../../src/webview/state/shownRows';
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
  const edits = () =>
    posted.filter((message): message is Extract<WebviewToHost, { type: 'edit' }> => message.type === 'edit');
  const cell = (key: string, code: string) =>
    store.rows.value.find((candidate) => candidate.key === key)!.cells[code]!;
  /** Edits a cell as the user would: opens it, types `value`, saves. */
  const type = (key: string, code: string, value: string) => {
    store.edit(id(key), code);
    store.edits.draft.value = value;
    store.edits.commit();
  };
  /** The id of the last text sent, which the host's answer names. */
  const lastRequest = () => edits().at(-1)!.requestId;
  return { store, edits, cell, type, lastRequest };
}

/** The text of CANCEL in French changed outside the editor, as a patch. */
function cancelInFrench(value: string) {
  const cancel = model.rows[1]!;
  return {
    type: 'patch' as const,
    patch: { rows: [{ ...cancel, cells: { ...cancel.cells, fr: text(value) } }] },
  };
}

/** The bundle of the tests with the text of SAVE in French changed outside the editor. */
function saveInFrench(value: string | undefined) {
  const save = model.rows[0]!;
  return {
    type: 'patch' as const,
    patch: { rows: [{ ...save, cells: { ...save.cells, fr: text(value) } }] },
  };
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
    expect(new Set(edits().map((edit) => edit.requestId)).size).toBe(3);
  });

  it('sends nothing when the text did not change, and closes the editor', () => {
    const { store, edits, type } = open();
    type('SAVE', 'fr', 'Enregistrer');
    type('SAVE', 'de-informal', '');
    expect(edits()).toEqual([]);
    expect(store.edits.open.value).toBeNull();
  });

  it('shows a sent text at once, without the findings of the old one, until the model has it', () => {
    const { store, cell, type, lastRequest } = open();
    type('ERROR_TITLE', 'fr', 'Erreur ({{date}})');
    expect(cell('ERROR_TITLE', 'fr')).toEqual({ value: 'Erreur ({{date}})', issues: [] });
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: true });
    expect(store.announcement.value.text).toBe('Gespeichert.');
    expect(cell('ERROR_TITLE', 'fr').value).toBe('Erreur ({{date}})');

    // The model with the written text; a later one shows what the files have then.
    store.receive({ type: 'bundle', model: withTexts({ ERROR_TITLE: { fr: text('Erreur ({{date}})') } }) });
    store.receive({ type: 'bundle', model: withTexts({ ERROR_TITLE: { fr: text('Erreur du {{date}}') } }) });
    expect(cell('ERROR_TITLE', 'fr').value).toBe('Erreur du {{date}}');
  });

  it('shows the findings of the new model even if it comes before the answer', () => {
    const { store, cell, type, lastRequest } = open();
    type('SAVE', 'fr', 'Sauver {{x}}');
    const mismatch = text('Sauver {{x}}', 'placeholder-mismatch');
    store.receive({ type: 'bundle', model: withTexts({ SAVE: { fr: mismatch } }) });
    expect(cell('SAVE', 'fr')).toEqual(mismatch);
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: true });
    expect(cell('SAVE', 'fr')).toEqual(mismatch);
  });

  it('shows no text for a cleared one, which the host deletes so that the fallback applies', () => {
    const { store, cell, type, lastRequest } = open();
    type('SAVE', 'fr', '');
    expect(cell('SAVE', 'fr').value).toBeUndefined();
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: true });
    expect(store.announcement.value.text).toBe('Text gelöscht.');
  });

  it('shows the old text again when writing fails, marks the cell and keeps the typed text', () => {
    const { store, cell, type, lastRequest } = open();
    type('CANCEL', 'de', 'Abbruch');
    store.receive({
      type: 'writeResult',
      requestId: lastRequest(),
      ok: false,
      message: 'CANCEL in de wurde zwischenzeitlich geändert.',
    });
    expect(cell('CANCEL', 'de')).toEqual({
      value: 'Abbrechen',
      issues: [],
      notSaved: 'CANCEL in de wurde zwischenzeitlich geändert.',
    });
    expect(store.announcement.value.text).toBe(
      'CANCEL in de: nicht gespeichert. CANCEL in de wurde zwischenzeitlich geändert.',
    );

    store.edit(id('CANCEL'), 'de');
    expect(store.edits.draft.value).toBe('Abbruch');
    expect(store.edits.open.value).toEqual({
      entryId: id('CANCEL'),
      locale: 'de',
      before: 'Abbrechen',
      error: 'CANCEL in de wurde zwischenzeitlich geändert.',
      place: 'rows',
      multiline: false,
    });
    store.edits.cancel();
    expect(cell('CANCEL', 'de').notSaved).toBeUndefined();
  });

  it('gives the text back without a mark when the user decided to keep it', () => {
    const { store, cell, type, lastRequest } = open();
    const { id } = store.announcement.value;
    type('SAVE', 'fr', '');
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: false });
    expect(cell('SAVE', 'fr')).toEqual(model.rows[0]!.cells['fr']);
    expect(store.announcement.value.id).toBe(id);
  });

  it('takes a failure into the editor of its cell when that is open again, with the text of the file', () => {
    const { store, edits, cell, type, lastRequest } = open();
    type('CANCEL', 'de', 'Abbruch');
    const sent = lastRequest();
    store.edit(id('CANCEL'), 'de');
    store.edits.draft.value = 'Abbruch!';
    store.receive({
      type: 'writeResult',
      requestId: sent,
      ok: false,
      message: 'Die Datei ist schreibgeschützt.',
    });
    expect(store.edits.open.value).toMatchObject({
      before: 'Abbrechen',
      error: 'Die Datei ist schreibgeschützt.',
    });
    expect(store.edits.draft.value).toBe('Abbruch!');
    expect(cell('CANCEL', 'de').notSaved).toBeUndefined();
    expect(store.announcement.value.text).toBe(
      'CANCEL in de: nicht gespeichert. Die Datei ist schreibgeschützt.',
    );
    store.edits.commit();
    expect(edits().at(-1)).toMatchObject({ value: 'Abbruch!', before: 'Abbrechen' });
  });

  it('lets the texts sent against a text that failed fail with it, and keeps the newest', () => {
    const { store, cell, type, edits } = open();
    type('CANCEL', 'de', 'Abbruch');
    type('CANCEL', 'de', 'Abbruch!');
    const [first, second] = edits();
    expect(second).toMatchObject({ value: 'Abbruch!', before: 'Abbruch' });
    const message = 'Die Datei hat ungespeicherte Änderungen.';
    store.receive({ type: 'writeResult', requestId: first!.requestId, ok: false, message });
    expect(cell('CANCEL', 'de')).toEqual({ value: 'Abbrechen', issues: [], notSaved: message });
    expect(store.announcement.value.text).toBe(`CANCEL in de: nicht gespeichert. ${message}`);
    // The host refuses the second text, sent against the first, as changed: that is no change outside.
    const { id: announced } = store.announcement.value;
    store.receive({
      type: 'writeResult',
      requestId: second!.requestId,
      ok: false,
      message: 'Geändert.',
      conflict: true,
    });
    expect(store.announcement.value.id).toBe(announced);
    store.edit(id('CANCEL'), 'de');
    expect(store.edits.draft.value).toBe('Abbruch!');
    expect(store.edits.open.value).toMatchObject({
      before: 'Abbrechen',
      error: message,
      conflict: undefined,
    });
  });

  it('offers the choice again for a text the host refused as changed in the meantime', () => {
    const { store, cell, type, lastRequest } = open();
    type('SAVE', 'fr', 'Sauver');
    store.receive({
      type: 'writeResult',
      requestId: lastRequest(),
      ok: false,
      message: 'Geändert.',
      conflict: true,
    });
    expect(cell('SAVE', 'fr').notSaved).toBe('Geändert.');
    store.edit(id('SAVE'), 'fr');
    expect(store.edits.draft.value).toBe('Sauver');
    expect(store.edits.open.value).toMatchObject({ error: undefined, conflict: { text: 'Enregistrer' } });
    // A model for another key leaves the choice to the user.
    store.receive(cancelInFrench('Annuler'));
    expect(store.edits.open.value).toMatchObject({ conflict: { text: 'Enregistrer' } });

    // With the editor open again, the refusal goes into it.
    store.edits.keepMine();
    store.edits.commit();
    store.edit(id('SAVE'), 'fr');
    store.receive({
      type: 'writeResult',
      requestId: lastRequest(),
      ok: false,
      message: 'Geändert.',
      conflict: true,
    });
    expect(store.edits.open.value).toMatchObject({
      before: 'Enregistrer',
      conflict: { text: 'Enregistrer' },
    });
    store.receive(cancelInFrench('Annulez'));
    expect(store.edits.open.value).toMatchObject({ conflict: { text: 'Enregistrer' } });
    // The model with the text the host saw: the choice shows it.
    store.receive(saveInFrench('Sauvegarder'));
    expect(store.edits.open.value).toMatchObject({ conflict: { text: 'Sauvegarder' } });
  });

  it('closes an editor without a typed text quietly, also in a conflict', () => {
    const { store, edits, cell } = open();
    store.edit(id('SAVE'), 'fr');
    store.receive(saveInFrench('Sauvegarder'));
    const { id: announced } = store.announcement.value;
    store.edits.commit();
    expect(edits()).toEqual([]);
    expect(cell('SAVE', 'fr')).toEqual(text('Sauvegarder'));
    expect(store.announcement.value.id).toBe(announced);

    store.edit(id('SAVE'), 'it');
    store.receive({
      type: 'patch',
      patch: { rows: [{ ...model.rows[0]!, cells: { ...model.rows[0]!.cells, it: text('Salvare') } }] },
    });
    expect(store.edits.open.value?.conflict).toEqual({ text: 'Salvare' });
    // The compact list leaves Italian out.
    store.width.value = 400;
    expect(store.edits.open.value).toBeNull();
    expect(cell('SAVE', 'it').notSaved).toBeUndefined();
  });

  it('closes the editor of a key that went, says whether a typed text was lost, and drops its marks', () => {
    const { store, type, lastRequest } = open();
    const withoutCancel = { ...model, rows: model.rows.filter((candidate) => candidate.key !== 'CANCEL') };
    type('CANCEL', 'de', 'Abbruch');
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: false, message: 'Geändert.' });
    store.edit(id('CANCEL'), 'fr');
    store.edits.draft.value = 'Annuler';
    store.receive({ type: 'bundle', model: withoutCancel });
    expect(store.edits.open.value).toBeNull();
    expect(store.announcement.value.text).toBe(
      'CANCEL in fr ist nicht mehr in dieser Einheit; der eingegebene Text wurde nicht gespeichert.',
    );
    expect(store.edits.rejected.value.size).toBe(0);

    store.receive({ type: 'bundle', model });
    store.edit(id('CANCEL'), 'fr');
    store.receive({ type: 'bundle', model: withoutCancel });
    expect(store.announcement.value.text).toBe('CANCEL in fr ist nicht mehr in dieser Einheit.');
  });

  it('keeps the row of the open editor while the filter no longer lets it through', () => {
    const { store, lastRequest } = open();
    const keys = () => store.rows.value.map((candidate) => candidate.key);
    store.toggleMissing();
    expect(keys()).toEqual(['CANCEL', 'ERROR_TITLE']);
    store.edit(id('CANCEL'), 'fr');
    store.edits.draft.value = 'Annuler';
    store.editNext(1);
    expect(store.edits.open.value).toMatchObject({ entryId: id('CANCEL'), locale: 'it' });
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: true });
    store.receive({ type: 'bundle', model: withTexts({ CANCEL: { fr: text('Annuler') } }) });
    expect(keys()).toEqual(['CANCEL', 'ERROR_TITLE']);
    store.edits.cancel();
    expect(keys()).toEqual(['ERROR_TITLE']);
  });

  it('keeps the text of an editor whose language a narrower layout leaves out as not saved, and says so', () => {
    const { store, cell, edits } = open();
    store.edit(id('SAVE'), 'it');
    store.edits.draft.value = 'Salvare';
    // The compact list shows the reference and French.
    store.width.value = 400;
    expect(store.edits.open.value).toBeNull();
    expect(store.announcement.value.text).toBe(
      'SAVE in it wird hier nicht gezeigt; Ihr Text bleibt als nicht gespeichert erhalten.',
    );
    // Its reason stays true once the language is shown again.
    const reason = 'Der Editor wurde geschlossen, als diese Sprache aus der Ansicht verschwand.';
    store.width.value = 1024;
    expect(cell('SAVE', 'it').notSaved).toBe(reason);
    store.edit(id('SAVE'), 'it');
    expect(store.edits.draft.value).toBe('Salvare');
    expect(store.edits.open.value?.error).toBe(reason);

    // A text that failed before keeps the reason it failed for.
    store.edits.commit();
    store.receive({
      type: 'writeResult',
      requestId: edits().at(-1)!.requestId,
      ok: false,
      message: 'Die Datei hat ungespeicherte Änderungen.',
    });
    store.edit(id('SAVE'), 'it');
    store.width.value = 400;
    store.width.value = 1024;
    expect(cell('SAVE', 'it').notSaved).toBe('Die Datei hat ungespeicherte Änderungen.');

    // Without a typed text, the editor just closes.
    store.edit(id('SAVE'), 'it');
    store.edits.cancel();
    store.edit(id('SAVE'), 'it');
    const { id: announced } = store.announcement.value;
    store.width.value = 400;
    expect(store.edits.open.value).toBeNull();
    expect(cell('SAVE', 'it').notSaved).toBeUndefined();
    expect(store.announcement.value.id).toBe(announced);
  });

  it('keeps the line breaks of a text of several lines, which the field turns into "\\n"', () => {
    const { store, edits } = open();
    store.receive({ type: 'bundle', model: withTexts({ SAVE: { fr: text('Enregistrer\r\nmaintenant') } }) });
    store.edit(id('SAVE'), 'fr');
    expect(store.edits.draft.value).toBe('Enregistrer\nmaintenant');
    expect(store.edits.open.value?.multiline).toBe(true);
    store.edits.commit();
    expect(edits()).toEqual([]);
    store.edit(id('SAVE'), 'fr');
    store.edits.draft.value = 'Enregistrer\ntout de suite';
    store.edits.commit();
    expect(edits()).toEqual([
      expect.objectContaining({ value: 'Enregistrer\r\ntout de suite', before: 'Enregistrer\r\nmaintenant' }),
    ]);
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

  it('takes a patch like a model: its rows have the written texts, and the other rows stay as they are', () => {
    const { store, cell, type, lastRequest } = open();
    type('SAVE', 'fr', 'Sauver');
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: true });
    const before = store.rows.value;
    const save = model.rows[0]!;
    store.receive({
      type: 'patch',
      patch: { rows: [{ ...save, cells: { ...save.cells, fr: text('Sauver') } }] },
    });
    expect(cell('SAVE', 'fr')).toEqual(text('Sauver'));
    expect(store.edits.pending.value).toEqual([]);
    expect(store.rows.value[1]).toBe(before[1]);
  });

  it('keeps the draft when the text of its cell changes outside, and says so', () => {
    const { store } = open();
    store.edit(id('SAVE'), 'fr');
    store.edits.draft.value = 'Sauver';
    store.receive(saveInFrench('Sauvegarder'));
    expect(store.edits.open.value?.conflict).toEqual({ text: 'Sauvegarder' });
    expect(store.edits.draft.value).toBe('Sauver');
    expect(store.announcement.value.text).toBe(
      'SAVE in fr wurde außerhalb des Editors geändert. Übernehmen Sie den neuen Text, oder behalten Sie Ihren.',
    );
    store.receive(saveInFrench(undefined));
    expect(store.edits.open.value?.conflict).toEqual({ text: undefined });
    // Back to the text editing began with: no conflict any more.
    store.receive(saveInFrench('Enregistrer'));
    expect(store.edits.open.value?.conflict).toBeUndefined();
  });

  it('takes the changed text, or keeps the draft to replace it, as the user chooses', () => {
    const { store, edits, lastRequest } = open();
    store.edit(id('SAVE'), 'fr');
    store.edits.draft.value = 'Sauver';
    store.receive(saveInFrench('Sauvegarder'));
    store.edits.keepMine();
    expect(store.edits.open.value).toMatchObject({ before: 'Sauvegarder', conflict: undefined });
    store.edits.commit();
    expect(edits()).toEqual([expect.objectContaining({ value: 'Sauver', before: 'Sauvegarder' })]);
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: true });

    store.edit(id('SAVE'), 'fr');
    store.edits.draft.value = 'Sauver tout';
    store.receive(saveInFrench('Tout sauver'));
    store.edits.takeTheirs();
    expect(store.edits.draft.value).toBe('Tout sauver');
    expect(store.edits.open.value).toMatchObject({ before: 'Tout sauver', conflict: undefined });
  });

  it('sees no change outside in the models that come while its own text is on its way', () => {
    const { store, lastRequest } = open();
    store.edit(id('SAVE'), 'fr');
    store.edits.draft.value = 'Sauver';
    store.editNext(-1);
    store.edit(id('SAVE'), 'fr');
    store.edits.draft.value = 'Sauver tout';
    // A model from before the text was written, then the one with it: the host checks the text against the
    // file (B5), so neither is a change outside.
    store.receive(saveInFrench('Enregistrer'));
    expect(store.edits.open.value?.conflict).toBeUndefined();
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: true });
    store.receive(saveInFrench('Sauver'));
    expect(store.edits.open.value?.conflict).toBeUndefined();
    expect(store.edits.draft.value).toBe('Sauver tout');
  });

  it('saves nothing against the old text in a conflict: the draft stays as not saved, with the choice', () => {
    const { store, edits, cell } = open();
    store.edit(id('SAVE'), 'fr');
    store.edits.draft.value = 'Sauver';
    store.receive(saveInFrench('Sauvegarder'));
    store.edits.commit();
    expect(edits()).toEqual([]);
    const notice =
      'SAVE in fr wurde außerhalb des Editors geändert. Übernehmen Sie den neuen Text, oder behalten Sie Ihren.';
    expect(cell('SAVE', 'fr')).toMatchObject({ value: 'Sauvegarder', notSaved: notice });
    expect(store.announcement.value.text).toBe(`SAVE in fr: nicht gespeichert. ${notice}`);
    store.edit(id('SAVE'), 'fr');
    expect(store.edits.draft.value).toBe('Sauver');
    expect(store.edits.open.value).toMatchObject({
      before: 'Sauvegarder',
      conflict: { text: 'Sauvegarder' },
    });
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
    before: 'b',
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
      ['k', { entryId: id('A'), locale: 'fr', text: 'x', message: 'Nicht gespeichert.', conflict: false }],
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
