// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_UI_STATE,
  isWebviewToHost,
  type UnsavedText,
  type WebviewToHost,
} from '../../../src/shared/protocol';
import { EditorStore } from '../../../src/webview/state/store';
import { findingsModel as model, GERMAN, panelState } from './support';

const id = (key: string) => JSON.stringify(key.split('.'));

/** A store that opens the bundle of the tests in German with the texts the host kept, and what it sends. */
function open(unsaved?: UnsavedText[]) {
  const posted: WebviewToHost[] = [];
  const store = new EditorStore({
    postMessage: (message) => void posted.push(message),
    setState: () => undefined,
  });
  store.receive({
    type: 'init',
    l10n: GERMAN,
    uiState: DEFAULT_UI_STATE,
    panelState,
    ...(unsaved ? { unsaved } : {}),
  });
  store.receive({ type: 'bundle', model });
  const cell = (key: string, code: string) =>
    store.rows.value.find((candidate) => candidate.key === key)!.cells[code]!;
  const type = (key: string, code: string, value: string) => {
    store.edit(id(key), code);
    store.edits.draft.value = value;
    store.edits.commit();
  };
  const lastRequest = () => posted.filter((message) => message.type === 'edit').at(-1)!.requestId;
  const kept = () => posted.filter((message) => message.type === 'unsaved').map((message) => message.texts);
  return { store, cell, type, lastRequest, kept };
}

afterEach(() => vi.useRealTimers());

// Closing the editor, reloading the window or a bundle that was gone for a while lost them (audit L-05).
describe('texts that were not saved', () => {
  it('stay while the bundle is missing, with the typed text of the open editor', () => {
    const { store, cell, type, lastRequest } = open();
    type('SAVE', 'fr', 'Sauver');
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: false, message: 'Disque plein.' });
    store.edit(id('CANCEL'), 'fr');
    store.edits.draft.value = 'Annuler';
    store.receive({ type: 'missing', name: 'common' });
    expect(store.edits.open.value).toBeNull();

    store.receive({ type: 'bundle', model });
    expect(cell('SAVE', 'fr').notSaved).toBe('Disque plein.');
    expect(cell('CANCEL', 'fr').notSaved).toBeTruthy();
    store.edit(id('CANCEL'), 'fr');
    expect(store.edits.draft.value).toBe('Annuler');
  });

  it('go to the host to keep, a moment after they change', () => {
    vi.useFakeTimers();
    const { store, type, lastRequest, kept } = open();
    type('SAVE', 'fr', 'Sauver');
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: false, message: 'Disque plein.' });
    store.edit(id('CANCEL'), 'fr');
    store.edits.draft.value = 'Annuler';
    expect(kept()).toEqual([]);
    vi.runOnlyPendingTimers();
    expect(kept()).toEqual([
      [
        {
          entryId: id('SAVE'),
          locale: 'fr',
          text: 'Sauver',
          message: 'Disque plein.',
          shown: 'Enregistrer',
          conflict: false,
        },
        expect.objectContaining({ entryId: id('CANCEL'), locale: 'fr', text: 'Annuler', conflict: false }),
      ],
    ]);
    // Only what changed goes again: here, nothing is left once the editor is given up.
    store.edits.cancel();
    store.edit(id('SAVE'), 'fr');
    store.edits.cancel();
    vi.runOnlyPendingTimers();
    expect(kept().at(-1)).toEqual([]);
    // An editor opened and closed without typing changes nothing to keep.
    store.edit(id('SAVE'), 'fr');
    store.edits.cancel();
    vi.runOnlyPendingTimers();
    expect(kept()).toHaveLength(2);
  });

  // The host takes the list only as a whole: one text it refused cost it every change after it.
  it('go to the host in a form it takes, also with a cut-off character from the file or a long reason', () => {
    vi.useFakeTimers();
    const { store, type, lastRequest, kept } = open();
    const cutOff = `Sauver ${String.fromCharCode(0xd83d)}`;
    type('SAVE', 'fr', cutOff);
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: false, message: 'Unreadable.' });
    type('CANCEL', 'fr', 'Annuler');
    store.receive({ type: 'writeResult', requestId: lastRequest(), ok: false, message: 'x'.repeat(5000) });
    vi.runOnlyPendingTimers();

    const texts = kept().at(-1)!;
    expect(isWebviewToHost({ type: 'unsaved', texts })).toBe(true);
    expect(texts.map((text) => text.text)).toEqual([cutOff, 'Annuler']);
  });

  it('come back from the host into their cells, as a conflict where the cell changed meanwhile', () => {
    const kept = (key: string, text: string, shown: string | null): UnsavedText => ({
      entryId: id(key),
      locale: 'fr',
      text,
      message: 'Disque plein.',
      shown,
      conflict: false,
    });
    const { store, cell } = open([
      kept('SAVE', 'Sauver', 'Enregistrer'),
      kept('CANCEL', 'Annuler', 'Autre'),
      kept('GONE', 'Parti', null),
    ]);
    expect(cell('SAVE', 'fr').notSaved).toBe('Disque plein.');
    expect(cell('CANCEL', 'fr').notSaved).toBeTruthy();
    expect(store.announcement.value.text).toContain(
      'Zuvor nicht gespeicherte Texte, wieder in ihren Zellen: 2',
    );
    store.edit(id('SAVE'), 'fr');
    expect([store.edits.draft.value, store.edits.open.value?.conflict]).toEqual(['Sauver', undefined]);
    store.edits.cancel();
    store.edit(id('CANCEL'), 'fr');
    expect(store.edits.draft.value).toBe('Annuler');
    expect(store.edits.open.value?.conflict).toBeDefined();
  });

  // Before its model, the editor has none of them: giving the host that would lose the texts it kept.
  it('are not given to the host before the texts it kept are back', () => {
    vi.useFakeTimers();
    const posted: WebviewToHost[] = [];
    const store = new EditorStore({
      postMessage: (message) => void posted.push(message),
      setState: () => undefined,
    });
    const unsaved = [
      {
        entryId: id('SAVE'),
        locale: 'fr',
        text: 'Sauver',
        message: 'm',
        shown: 'Enregistrer',
        conflict: false,
      },
    ];
    store.receive({ type: 'init', l10n: GERMAN, uiState: DEFAULT_UI_STATE, panelState, unsaved });
    store.receive({ type: 'missing', name: 'common' });
    vi.runOnlyPendingTimers();
    expect(posted.filter((message) => message.type === 'unsaved')).toEqual([]);
  });
});
