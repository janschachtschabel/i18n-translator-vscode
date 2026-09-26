// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiState } from '../../../src/shared/protocol';
import { DEFAULT_FILTER } from '../../../src/shared/filter';
import { findingsModel, openWith as open, axeProblems, mailModel, row, text } from './support';

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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  // Without a reference the compact list had one language and no choice (audit F-02, T-12).
  it('offers the choice among the visible languages, also without a reference', () => {
    setWidth(400);
    const unreferenced = {
      ...findingsModel,
      locales: findingsModel.locales.map((shown) => ({ ...shown, reference: false })),
    };
    const { store } = open({}, unreferenced);
    expect(terms('SAVE')).toEqual(['de']);
    const choice = () => screen.getByRole('combobox', { name: 'Sprache' }) as HTMLSelectElement;
    act(() => void fireEvent.change(choice(), { target: { value: 'fr' } }));
    expect(terms('SAVE')).toEqual(['fr']);
    act(() => store.toggleLocale('fr'));
    expect(terms('SAVE')).toEqual(['de']);
    expect([...choice().options].map((option) => option.value)).toEqual(['de', 'de-informal', 'it']);
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

  // Beyond the first 200 rows and the 200 of the next step: a card that only the handoff keeps. Rendering them
  // takes seconds beside other test files, so the language is one and the time generous.
  it(
    'hands the focus on to the card of a key far down, beyond the cards shown at first',
    { timeout: 20_000 },
    async () => {
      const keys = Array.from({ length: 450 }, (_, index) => `K${String(index).padStart(3, '0')}`);
      const rows = keys.map((key) => row(key, { de: text(key) }));
      open({}, { ...findingsModel, locales: [findingsModel.locales[0]!], rows });
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
    },
  );

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

  // After Enter or Esc the text takes the focus back; after a click beside the editor it stays where the click put
  // it (audit F-01).
  it('leaves the focus on the page after a click beside the editor of a card', async () => {
    setWidth(600);
    open();
    act(() => void fireEvent.click(within(cardOf('SAVE')).getByRole('button', { name: /^fr: / })));
    const field = screen.getByRole('textbox');
    expect(document.activeElement).toBe(field);
    act(() => field.blur());
    await Promise.resolve();
    await nextTask();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  // Like the table, the list keeps its top card in place when the cards change their height (audit T-12).
  it('keeps the top card in place when a language is hidden', () => {
    setWidth(600);
    // happy-dom has no layout: a card is 10 px high per field, the cards follow each other, the view is 200 px.
    const height = (card: HTMLElement) => 10 * card.querySelectorAll('dt').length;
    const cards = () => [...document.querySelectorAll<HTMLElement>('[data-entry]')];
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset['entry'] ? height(this) : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return cards()
        .slice(0, cards().indexOf(this))
        .reduce((sum, card) => sum + height(card), 0);
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    const rows = Array.from({ length: 10 }, (_, index) =>
      row(`KEY_${index}`, { de: text('a'), 'de-informal': text(undefined), fr: text('b'), it: text('c') }),
    );
    const { store } = open({}, { ...findingsModel, rows });
    const page = document.scrollingElement as HTMLElement;
    // Cards of 40 px: KEY_3 is cut off at the top of the view (130), KEY_4 starts 30 px below it.
    page.scrollTop = 130;
    act(() => store.toggleLocale('de-informal'));
    // Cards of 30 px: KEY_4 starts at 120 and again 30 px below the top of the view.
    expect(page.scrollTop).toBe(90);
  });

  it('names the key of each card for the context menu, which offers the key commands', () => {
    setWidth(600);
    open();
    expect(JSON.parse(cardOf('CANCEL').dataset['vscodeContext']!)).toEqual({
      webviewSection: 'key',
      entryId: JSON.stringify(['CANCEL']),
    });
  });

  it('marks the cards of mail templates, whose context menu offers the preview', () => {
    setWidth(600);
    open({}, mailModel);
    const card = within(screen.getByRole('list', { name: 'templates' }))
      .getByRole('heading', { level: 2, name: 'invited.message' })
      .closest('li')!;
    expect(JSON.parse(card.dataset['vscodeContext']!)).toEqual({
      webviewSection: 'key',
      entryId: JSON.stringify(['invited', 'message']),
      mailTemplate: true,
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
