// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FILTER } from '../../../src/shared/filter';
import { openWith as open, axeProblems, mailModel } from './support';

const id = (key: string) => JSON.stringify(key.split('.'));
const grid = () => screen.getByRole('grid', { name: 'common' });
const rowOf = (key: string) => within(grid()).getByRole('rowheader', { name: key }).parentElement!;
/** The cell of a key in a language column: de, de-informal, fr, it. */
const cellOf = (key: string, column: number) => within(rowOf(key)).getAllByRole('gridcell')[column]!;
const details = () => screen.getByRole('complementary', { name: /^Details/ });
const inDetails = () => within(details());
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => void fireEvent.keyDown(document.activeElement!, { key, ...init }));
const typeText = (value: string) =>
  act(() => void fireEvent.input(screen.getByRole('textbox'), { target: { value } }));
/** The finding lines and the hints under them in the details, per language. */
const notes = (code: string) =>
  [
    ...inDetails()
      .getByRole('button', { name: new RegExp(`^${code}: `) })
      .parentElement!.querySelectorAll('p'),
  ].map((note) => note.textContent);

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
});
afterEach(cleanup);

describe('details', () => {
  it('show every language of the active key, hidden ones too, each text a button that edits it', () => {
    open({ hiddenLocales: ['it'] });
    expect(details().getAttribute('aria-labelledby')).toBeTruthy();
    expect(inDetails().getByRole('heading', { level: 2 }).textContent).toBe('Details: SAVE');
    expect(
      inDetails()
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['de Referenz', 'de-informal Variante', 'fr', 'it']);
    expect(
      inDetails()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['de: Speichern', 'de-informal: –kein eigener Text', 'fr: Enregistrer', 'it: Salva']);
  });

  it('follow the active cell of the table, and keep their key in the header row', () => {
    open();
    act(() => cellOf('SAVE', 2).focus());
    press('ArrowDown');
    expect(details().textContent).toContain('Details: CANCEL');
    press('Home', { ctrlKey: true });
    expect(details().textContent).toContain('Details: CANCEL');
  });

  it('explain each finding and say how to solve it', () => {
    open();
    act(() => cellOf('ERROR_TITLE', 2).focus());
    expect(notes('fr')).toEqual([
      '✖ Fehler: Die Platzhalter von ERROR_TITLE weichen ab.',
      'Übernehmen Sie die Platzhalter der Referenz unverändert; die Anwendung füllt sie aus.',
    ]);
    expect(notes('it')).toEqual(['⚠ Warnung: ERROR_TITLE fehlt in it.', 'Fügen Sie die Übersetzung hinzu.']);
  });

  it('edit a text in their own place; Tab goes on to the next language of the key, hidden ones too', () => {
    const { posted } = open({ hiddenLocales: ['fr'] });
    act(
      () => void fireEvent.click(inDetails().getByRole('button', { name: 'de-informal: kein eigener Text' })),
    );
    expect(document.activeElement).toBe(inDetails().getByRole('textbox', { name: 'SAVE in de-informal' }));
    expect(within(grid()).queryByRole('textbox')).toBeNull();
    typeText('Speichere');
    press('Tab');
    expect(document.activeElement).toBe(inDetails().getByRole('textbox', { name: 'SAVE in fr' }));
    press('Escape');
    expect(document.activeElement).toBe(inDetails().getByRole('button', { name: 'fr: Enregistrer' }));
    expect(posted.filter((message) => message.type === 'edit')).toEqual([
      expect.objectContaining({
        entryId: id('SAVE'),
        locale: 'de-informal',
        value: 'Speichere',
        before: null,
      }),
    ]);
  });

  it('offer to delete an empty text, which hides the fallback', () => {
    const { posted } = open();
    act(() => cellOf('WORKSPACE.TITLE', 3).focus());
    act(
      () =>
        void fireEvent.click(inDetails().getByRole('button', { name: 'Text löschen WORKSPACE.TITLE in it' })),
    );
    expect(posted.at(-1)).toEqual({
      type: 'edit',
      requestId: expect.any(String),
      entryId: id('WORKSPACE.TITLE'),
      locale: 'it',
      value: '',
      before: '',
    });
  });

  it('say so when no key is there to show', () => {
    const { store } = open();
    act(() => store.updateFilter({ query: 'xyz' }));
    expect(details().textContent).toContain('Wählen Sie in der Tabelle einen Key');
  });

  it('can be hidden, and are not part of the list', () => {
    open({ details: false });
    expect(screen.queryByRole('complementary')).toBeNull();
    cleanup();
    open({ layout: 'list' });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('have no accessibility violations, also while a text is edited in them', async () => {
    open({ filter: { ...DEFAULT_FILTER, status: 'findings' } });
    act(() => cellOf('ERROR_TITLE', 2).focus());
    expect(await axeProblems()).toEqual([]);
    act(() => void fireEvent.click(inDetails().getByRole('button', { name: /^fr: / })));
    expect(await axeProblems()).toEqual([]);
  });
});

describe('the mail preview in the details', () => {
  it('opens beside the editor for the template of the active key, and says that it opens', async () => {
    const { posted, store } = open({}, mailModel);
    act(() => void fireEvent.click(inDetails().getByRole('button', { name: 'Mail-Vorschau' })));
    expect(posted.filter((message) => message.type === 'preview')).toEqual([
      { type: 'preview', entryId: id('invited.subject') },
    ]);
    expect(store.announcement.value.text).toBe(
      'Die Mail invited öffnet sich in der Vorschau neben dem Editor.',
    );
    expect(await axeProblems()).toEqual([]);
  });

  it('is offered for mail templates only', () => {
    open();
    expect(inDetails().queryByRole('button', { name: 'Mail-Vorschau' })).toBeNull();
  });
});
