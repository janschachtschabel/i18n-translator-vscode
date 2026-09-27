// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebviewToHost } from '../../../src/shared/protocol';
import { axeProblems, findingsModel, openWith as open, text } from './support';

const id = (key: string) => JSON.stringify(key.split('.'));
const grid = () => screen.getByRole('grid', { name: 'common' });
const rowOf = (key: string) => within(grid()).getByRole('rowheader', { name: key }).parentElement!;
/** The cell of a key in a language column: de, de-informal, fr, it. */
const cellOf = (key: string, column: number) => within(rowOf(key)).getAllByRole('gridcell')[column]!;
const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const suggestButton = () => screen.queryByRole('button', { name: 'KI-Vorschlag' });
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => void fireEvent.keyDown(document.activeElement!, { key, ...init }));
const requests = (posted: readonly WebviewToHost[]) =>
  posted.filter(
    (message): message is Extract<WebviewToHost, { type: 'aiSuggest' }> => message.type === 'aiSuggest',
  );
const status = () => document.querySelector('.editor-ai [role="status"]')?.textContent ?? '';
const hint = () => document.getElementById('cell-editor-hint')?.textContent ?? '';
/** The French text of SAVE changes outside the editor. */
const saveInFrench = (value: string) => {
  const save = findingsModel.rows[0]!;
  return {
    type: 'patch' as const,
    patch: { rows: [{ ...save, cells: { ...save.cells, fr: text(value) } }] },
  };
};
/** VS Code takes the focus from the page (a dialog), and the field loses it; returns the end of the dialog. */
async function dialogOpens() {
  const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  act(() => field().blur());
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return () => hasFocus.mockRestore();
}

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
});
afterEach(cleanup);

describe('the AI suggestion in the cell editor', () => {
  it('is offered for translations with a reference text, and only while the AI can be used', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    expect(suggestButton()?.getAttribute('aria-keyshortcuts')).toBe('Control+I Meta+I');
    press('Escape');
    // The reference has nothing to translate from.
    act(() => void fireEvent.click(cellOf('CANCEL', 0)));
    expect(suggestButton()).toBeNull();
    press('Escape');

    send({ type: 'aiState', available: false, reason: 'disabled', model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    expect(suggestButton()).toBeNull();
    press('Escape');

    // Without a key, the editor leads to setting one.
    send({ type: 'aiState', available: false, reason: 'no-key', model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    act(
      () => void fireEvent.click(screen.getByRole('button', { name: 'KI-Vorschlag: API-Schlüssel setzen…' })),
    );
    expect(posted.at(-1)).toEqual({ type: 'aiSetup' });
  });

  it('asks for a suggestion with its button or Ctrl+I, says that it waits, and Esc cancels only the request', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    act(() => void fireEvent.click(suggestButton()!));
    const [request] = requests(posted);
    expect(request).toEqual({
      type: 'aiSuggest',
      requestId: expect.any(String),
      entryId: id('CANCEL'),
      locale: 'fr',
    });
    expect(status()).toBe('Vorschlag von gpt-6-luna wird geholt … Esc bricht ab.');
    expect(document.activeElement).toBe(field());
    expect(suggestButton()!.hasAttribute('disabled')).toBe(true);

    press('Escape');
    expect(posted.at(-1)).toEqual({ type: 'aiCancel', requestId: request!.requestId });
    expect(screen.getByRole('textbox', { name: 'CANCEL in fr' })).toBeTruthy();
    expect(status()).toBe('');

    press('i', { ctrlKey: true });
    expect(requests(posted)).toHaveLength(2);
    expect(requests(posted)[1]!.requestId).not.toBe(request!.requestId);
  });

  it('puts the suggestion into the field, marked for checking; Esc brings the text back, Enter saves it', async () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('ERROR_TITLE', 2)));
    press('i', { ctrlKey: true });
    send({ type: 'aiSuggestion', requestId: requests(posted)[0]!.requestId, text: 'Erreur ({{date}})' });
    expect(field().value).toBe('Erreur ({{date}})');
    expect(status()).toBe('KI-Vorschlag – bitte prüfen. Esc stellt Ihren Text wieder her.');
    expect(document.querySelector('.editor-check')?.textContent).toContain(
      'Platzhalter und HTML-Tags wie in der Referenz.',
    );
    expect(await axeProblems()).toEqual([]);

    press('Escape');
    expect(field().value).toBe('Erreur ({{data}})');
    expect(status()).toBe('');

    press('i', { ctrlKey: true });
    send({ type: 'aiSuggestion', requestId: requests(posted)[1]!.requestId, text: 'Erreur ({{date}})' });
    press('Enter');
    expect(posted.filter((message) => message.type === 'edit').at(-1)).toMatchObject({
      entryId: id('ERROR_TITLE'),
      locale: 'fr',
      value: 'Erreur ({{date}})',
    });
  });

  it('gives the field the focus back when the suggestion comes after VS Code had it (the consent dialog)', async () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    press('i', { ctrlKey: true });
    const dialogCloses = await dialogOpens();
    dialogCloses();
    send({ type: 'aiSuggestion', requestId: requests(posted)[0]!.requestId, text: 'Annuler' });
    expect(field().value).toBe('Annuler');
    expect(document.activeElement).toBe(field());
  });

  it('shows why there is no suggestion, and drops one for an editor that closed', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    press('i', { ctrlKey: true });
    send({
      type: 'aiSuggestion',
      requestId: requests(posted)[0]!.requestId,
      message: 'Die b-api hat den Schlüssel abgelehnt (HTTP 401).',
    });
    expect(status()).toBe('✖ Fehler: Die b-api hat den Schlüssel abgelehnt (HTTP 401).');
    expect(suggestButton()!.hasAttribute('disabled')).toBe(false);

    press('i', { ctrlKey: true });
    // Another cell opens before the answer comes.
    act(() => void fireEvent.click(cellOf('WORKSPACE.TITLE', 2)));
    send({ type: 'aiSuggestion', requestId: requests(posted)[1]!.requestId, text: 'Annuler' });
    expect(field().value).toBe('Espace de travail');
    expect(status()).toBe('');
  });

  it('opens the editor of the active cell with Ctrl+I and asks for a suggestion', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => cellOf('CANCEL', 2).focus());
    press('i', { ctrlKey: true });
    expect(field()).toBe(screen.getByRole('textbox', { name: 'CANCEL in fr' }));
    expect(requests(posted)).toEqual([expect.objectContaining({ entryId: id('CANCEL'), locale: 'fr' })]);
  });

  it('cancels the request of an editor that closes: the next editor closes with its first Esc, and can ask', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    press('i', { ctrlKey: true });
    const [first] = requests(posted);
    press('Tab');
    expect(posted.at(-1)).toEqual({ type: 'aiCancel', requestId: first!.requestId });
    expect(field()).toBe(screen.getByRole('textbox', { name: 'CANCEL in it' }));
    press('Escape');
    expect(screen.queryByRole('textbox')).toBeNull();

    act(() => void fireEvent.click(cellOf('ERROR_TITLE', 2)));
    press('i', { ctrlKey: true });
    expect(requests(posted)).toHaveLength(2);
    expect(status()).toBe('Vorschlag von gpt-6-luna wird geholt … Esc bricht ab.');
  });

  it('forgets why there was no suggestion once its editor closes', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    press('i', { ctrlKey: true });
    send({ type: 'aiSuggestion', requestId: requests(posted)[0]!.requestId, message: 'Kaputt.' });
    expect(status()).toBe('✖ Fehler: Kaputt.');
    press('Escape');
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    expect(status()).toBe('');
  });

  it('gives the field the focus back when the page gets it back after a dialog, also after a failure', async () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    press('i', { ctrlKey: true });
    const dialogCloses = await dialogOpens();
    try {
      send({
        type: 'aiSuggestion',
        requestId: requests(posted)[0]!.requestId,
        message: 'Keine Einwilligung.',
      });
      expect(document.activeElement).toBe(document.body);
    } finally {
      dialogCloses();
    }
    act(() => void window.dispatchEvent(new FocusEvent('focus')));
    expect(document.activeElement).toBe(field());
    press('Escape');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('leaves the focus with VS Code when a suggestion comes while VS Code has it', async () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    press('i', { ctrlKey: true });
    const dialogCloses = await dialogOpens();
    try {
      send({ type: 'aiSuggestion', requestId: requests(posted)[0]!.requestId, text: 'Annuler' });
      expect(field().value).toBe('Annuler');
      expect(document.activeElement).toBe(document.body);
    } finally {
      dialogCloses();
    }
    act(() => void window.dispatchEvent(new FocusEvent('focus')));
    expect(document.activeElement).toBe(field());
  });

  it('asks nothing for a text of the reference with Ctrl+I: it only opens its editor', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => cellOf('CANCEL', 0).focus());
    press('i', { ctrlKey: true });
    expect(field()).toBe(screen.getByRole('textbox', { name: 'CANCEL in de' }));
    expect(requests(posted)).toEqual([]);
  });

  it('leads Ctrl+I to setting the key when there is none', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: false, reason: 'no-key', model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    press('i', { ctrlKey: true });
    expect(posted.at(-1)).toEqual({ type: 'aiSetup' });
    expect(requests(posted)).toEqual([]);
  });

  it('offers no suggestion while the text changed outside the editor, and keeps Ctrl+I from VS Code', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('SAVE', 2)));
    act(() => void fireEvent.input(field(), { target: { value: 'Sauver' } }));
    send(saveInFrench('Sauvegarder'));
    expect(suggestButton()!.hasAttribute('disabled')).toBe(true);
    expect(fireEvent.keyDown(field(), { key: 'i', ctrlKey: true })).toBe(false);
    expect(requests(posted)).toEqual([]);
  });

  it('takes a suggestion of several lines back with Enter saving again', () => {
    const { send, posted } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(cellOf('CANCEL', 2)));
    press('i', { ctrlKey: true });
    send({ type: 'aiSuggestion', requestId: requests(posted)[0]!.requestId, text: 'Annuler\nmaintenant' });
    expect(hint()).toMatch(/^Strg\+Enter speichert/);
    press('Escape');
    expect(field().value).toBe('');
    expect(hint()).toMatch(/^Enter speichert/);
  });

  it('names Ctrl+I in the help of the grid and on the active cell while the AI can be used', () => {
    const { send } = open();
    const help = () => document.getElementById('grid-help')!.textContent;
    const shortcuts = (key: string, column: number) => cellOf(key, column).getAttribute('aria-keyshortcuts');
    act(() => cellOf('CANCEL', 2).focus());
    expect(shortcuts('CANCEL', 2)).toBe('Enter F2');
    expect(help()).not.toContain('Strg+I');
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    expect(shortcuts('CANCEL', 2)).toBe('Enter F2 Control+I Meta+I');
    expect(help()).toContain('Strg+I holt einen KI-Vorschlag für einen Text.');
    // The reference has nothing to translate from.
    act(() => cellOf('CANCEL', 0).focus());
    expect(shortcuts('CANCEL', 0)).toBe('Enter F2');
  });

  it('asks with ids that a reloaded page does not use again', () => {
    const ids = [0, 1].map(() => {
      const { send, posted } = open();
      send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
      act(() => void fireEvent.click(cellOf('CANCEL', 2)));
      press('i', { ctrlKey: true });
      const [request] = requests(posted);
      cleanup();
      return request!.requestId;
    });
    expect(ids[0]).not.toBe(ids[1]);
  });
});
