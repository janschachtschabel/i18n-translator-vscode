// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UiState } from '../../../src/shared/protocol';
import { DEFAULT_FILTER } from '../../../src/shared/filter';
import { findingsModel, openWith as open, axeProblems, row, text } from './support';

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  act(() => void window.dispatchEvent(new Event('resize')));
}

const list = () => screen.getByRole('list', { name: 'common' });
const cardOf = (key: string) => within(list()).getByRole('heading', { level: 2, name: key }).closest('li')!;
const terms = (key: string) =>
  within(cardOf(key))
    .getAllByRole('term')
    .map((term) => term.textContent);
const definitionOf = (key: string, position: number) =>
  within(cardOf(key)).getAllByRole('definition')[position]!;
const grid = () => within(screen.getByRole('grid'));
/** The cell of a key in a language column of the grid: de, de-informal, fr, it. */
const cellOf = (key: string, column: number) =>
  within(grid().getByRole('rowheader', { name: key }).parentElement!).getAllByRole('gridcell')[column]!;
const nextTask = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
  setWidth(1024);
});
afterEach(cleanup);

describe('list', () => {
  it('shows a card per key below 900 px, with a labelled field per visible language', () => {
    setWidth(600);
    open({ hiddenLocales: ['de-informal'] });
    expect(screen.queryByRole('grid')).toBeNull();
    expect(
      within(list())
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['SAVE', 'CANCEL', 'WORKSPACE.TITLE', 'ERROR_TITLE']);
    expect(terms('SAVE')).toEqual(['de Referenz', 'fr', 'it']);
    expect(within(definitionOf('SAVE', 1)).getByText('Enregistrer').getAttribute('lang')).toBe('fr');
  });

  it('shows each finding with a symbol and its message', () => {
    setWidth(600);
    open();
    const findings = (key: string, position: number) =>
      [...definitionOf(key, position).querySelectorAll('.card-finding')].map(
        (finding) => finding.textContent,
      );
    expect(findings('CANCEL', 2)).toEqual(['⚠ Warnung: CANCEL fehlt in fr.']);
    expect(findings('ERROR_TITLE', 2)).toEqual(['✖ Fehler: Die Platzhalter von ERROR_TITLE weichen ab.']);
    expect(within(definitionOf('ERROR_TITLE', 2)).getByText('Erreur ({{data}})')).toBeTruthy();
    expect(definitionOf('CANCEL', 2).querySelector('.card-hint')?.textContent).toBe(
      'Fügen Sie die Übersetzung hinzu.',
    );
    expect(within(definitionOf('CANCEL', 2)).getByText('⚠').getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the reference and one chosen language up to 480 px', () => {
    setWidth(400);
    const { store, posted } = open();
    // A variant leaves most texts to its base, so the first full language comes first.
    expect(terms('SAVE')).toEqual(['de Referenz', 'fr']);
    act(
      () =>
        void fireEvent.change(screen.getByRole('combobox', { name: 'Zweite Sprache' }), {
          target: { value: 'it' },
        }),
    );
    expect(terms('SAVE')).toEqual(['de Referenz', 'it']);
    expect(store.uiState.value.compactLocale).toBe('it');
    expect((posted.at(-1) as { state: UiState }).state.compactLocale).toBe('it');
  });

  it('keeps the layout the user chose', () => {
    setWidth(400);
    open({ layout: 'table' });
    expect(screen.getByRole('grid')).toBeTruthy();
    cleanup();
    open({ layout: 'list' });
    expect(terms('SAVE')).toEqual(['de Referenz', 'de-informal Variante', 'fr', 'it']);
  });

  it('switches layout when the editor gets narrower', () => {
    open();
    expect(screen.getByRole('grid')).toBeTruthy();
    setWidth(600);
    expect(screen.queryByRole('grid')).toBeNull();
    expect(list()).toBeTruthy();
  });

  it('takes the focus from the grid to the card of its key when the editor gets narrower', () => {
    open();
    const cancel = within(screen.getByRole('grid')).getByRole('rowheader', { name: 'CANCEL' });
    act(() => cancel.focus());
    setWidth(600);
    expect(document.activeElement).toBe(within(list()).getByRole('heading', { level: 2, name: 'CANCEL' }));
  });

  it('hands the focus on to the card of a key far down, beyond the cards shown at first', async () => {
    const keys = Array.from({ length: 450 }, (_, index) => `K${String(index).padStart(3, '0')}`);
    open({}, { ...findingsModel, rows: keys.map((key) => row(key, { de: text(key) })) });
    const first = within(screen.getByRole('grid')).getByRole('rowheader', { name: 'K000' });
    act(() => first.focus());
    act(() => void fireEvent.keyDown(first, { key: 'End', ctrlKey: true }));
    act(() => void fireEvent.keyDown(document.activeElement!, { key: 'Home' }));
    expect(document.activeElement?.textContent).toBe('K449');
    setWidth(600);
    const heading = () => within(list()).getByRole('heading', { level: 2, name: 'K449' });
    expect(document.activeElement).toBe(heading());
    // The next block of cards comes a task later: the card of the key stays.
    await nextTask();
    expect(document.activeElement).toBe(heading());

    setWidth(1024);
    expect(document.activeElement).toBe(grid().getByRole('rowheader', { name: 'K449' }));
    await nextTask();
    expect(document.activeElement).toBe(grid().getByRole('rowheader', { name: 'K449' }));
  });

  it('keeps the language when the focus goes from a text of the grid to the list, and back', () => {
    open();
    act(() => cellOf('CANCEL', 2).focus());
    setWidth(600);
    expect(document.activeElement).toBe(within(cardOf('CANCEL')).getByRole('button', { name: /^fr: / }));
    setWidth(1024);
    expect(document.activeElement).toBe(cellOf('CANCEL', 2));
  });

  it('hands the focus on from the details to the card of their key, in the same language', () => {
    open();
    const details = within(screen.getByRole('complementary', { name: /^Details/ }));
    act(() => details.getByRole('button', { name: 'fr: Enregistrer' }).focus());
    setWidth(600);
    expect(document.activeElement).toBe(
      within(cardOf('SAVE')).getByRole('button', { name: 'fr: Enregistrer' }),
    );
  });

  it('does not take the focus from the filter when cards come back after none matched', () => {
    setWidth(600);
    const { send } = open({ filter: { ...DEFAULT_FILTER, status: 'missing' } });
    act(() => within(cardOf('ERROR_TITLE')).getByRole('button', { name: /^it: / }).focus());
    const filled = findingsModel.rows.map((candidate) =>
      candidate.key === 'CANCEL'
        ? { ...candidate, cells: { ...candidate.cells, fr: text('Annuler') } }
        : candidate.key === 'ERROR_TITLE'
          ? { ...candidate, cells: { ...candidate.cells, it: text('Errore ({{date}})') } }
          : candidate,
    );
    send({ type: 'bundle', model: { ...findingsModel, rows: filled } });
    expect(screen.queryByRole('list', { name: 'common' })).toBeNull();
    const show = screen.getByRole('combobox', { name: 'Zeigen' });
    act(() => show.focus());
    act(() => void fireEvent.change(show, { target: { value: 'all' } }));
    expect(list()).toBeTruthy();
    expect(document.activeElement).toBe(show);
  });

  it('hands the focus on to the key that took the place of the active one, once that went', () => {
    const { send } = open({ filter: { ...DEFAULT_FILTER, status: 'missing' } });
    const grid = within(screen.getByRole('grid'));
    act(() => grid.getByRole('rowheader', { name: 'CANCEL' }).focus());
    const rows = findingsModel.rows.map((candidate) =>
      candidate.key === 'CANCEL'
        ? { ...candidate, cells: { ...candidate.cells, fr: text('Annuler') } }
        : candidate,
    );
    send({ type: 'bundle', model: { ...findingsModel, rows } });
    expect(document.activeElement).toBe(grid.getByRole('rowheader', { name: 'ERROR_TITLE' }));
    setWidth(600);
    expect(document.activeElement).toBe(
      within(list()).getByRole('heading', { level: 2, name: 'ERROR_TITLE' }),
    );
  });

  it('hands the focus back to the grid, on the key of its card, when the editor gets wider', () => {
    setWidth(600);
    open();
    act(() => cardOf('CANCEL').querySelector('h2')!.focus());
    setWidth(1024);
    expect(document.activeElement).toBe(grid().getByRole('rowheader', { name: 'CANCEL' }));
  });

  it('names the key of each card for the context menu, which offers the key commands', () => {
    setWidth(600);
    open();
    expect(JSON.parse(cardOf('CANCEL').dataset['vscodeContext']!)).toEqual({
      webviewSection: 'key',
      entryId: JSON.stringify(['CANCEL']),
    });
  });

  it('has no accessibility violations, full or compact', async () => {
    setWidth(600);
    open();
    expect(await axeProblems()).toEqual([]);
    setWidth(400);
    expect(await axeProblems()).toEqual([]);
  });
});
