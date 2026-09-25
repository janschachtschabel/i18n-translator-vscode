// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTER } from '../../../src/shared/filter';
import { findingsModel as model, openWith as open, row, text } from './support';

const grid = () => screen.getByRole('grid', { name: 'common' });
const rowOf = (key: string) => within(grid()).getByRole('rowheader', { name: key }).parentElement!;
/** The cell of a key in a language column: columns are de, de-informal, fr, it unless hidden. */
const cellOf = (key: string, column: number) => within(rowOf(key)).getAllByRole('gridcell')[column]!;
const description = (element: Element) =>
  document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent;
const press = (key: string, modifiers: { ctrlKey?: boolean; altKey?: boolean } = {}) =>
  act(() => void fireEvent.keyDown(document.activeElement!, { key, ...modifiers }));

/** Rows KEY_0 … KEY_n-1 with a German text each; those `missing` picks lack their French text. */
function manyRows(count: number, missing: (index: number) => boolean = () => false) {
  return Array.from({ length: count }, (_, index) =>
    row(`KEY_${index}`, {
      de: text(`Text ${index}`),
      'de-informal': text(undefined),
      fr: missing(index) ? text(undefined, 'missing-key') : text(`Texte ${index}`),
      it: text(undefined),
    }),
  );
}

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('table', () => {
  it('shows the rows as a grid: a key column and a column per visible language', () => {
    open();
    expect(grid().getAttribute('aria-rowcount')).toBe('5');
    expect(grid().getAttribute('aria-colcount')).toBe('5');
    expect(
      within(grid())
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Key', 'de Referenz', 'de-informal Variante', 'fr', 'it']);
    expect(
      within(grid())
        .getAllByRole('rowheader')
        .map((header) => header.textContent),
    ).toEqual(['SAVE', 'CANCEL', 'WORKSPACE.TITLE', 'ERROR_TITLE']);
    expect(rowOf('CANCEL').getAttribute('aria-rowindex')).toBe('3');
    expect(cellOf('CANCEL', 2).getAttribute('aria-colindex')).toBe('4');
  });

  it('leaves out hidden languages and filtered rows', () => {
    open({ hiddenLocales: ['de-informal'], filter: { ...DEFAULT_FILTER, status: 'missing' } });
    expect(grid().getAttribute('aria-rowcount')).toBe('3');
    expect(grid().getAttribute('aria-colcount')).toBe('4');
    expect(
      within(grid())
        .getAllByRole('rowheader')
        .map((header) => header.textContent),
    ).toEqual(['CANCEL', 'ERROR_TITLE']);
  });

  it('marks each status with a symbol and a word, and describes it with the finding', () => {
    open();
    const missing = cellOf('CANCEL', 2);
    expect(missing.textContent).toBe('⚠ fehlt');
    expect(within(missing).getByText('⚠').getAttribute('aria-hidden')).toBe('true');
    expect(description(missing)).toBe('CANCEL fehlt in fr.');
    expect(cellOf('WORKSPACE.TITLE', 3).textContent).toBe('⚠ leer');
    const mismatch = cellOf('ERROR_TITLE', 2);
    expect(mismatch.textContent).toBe('Erreur ({{data}}) ✖ Platzhalter');
    expect(description(mismatch)).toBe('Die Platzhalter von ERROR_TITLE weichen ab.');
    expect(cellOf('SAVE', 2).getAttribute('aria-describedby')).toBeNull();
  });

  it('tells screen readers the language of each text', () => {
    open();
    expect(within(cellOf('SAVE', 2)).getByText('Enregistrer').getAttribute('lang')).toBe('fr');
  });

  it('has one tab stop and moves the focus with the keys of a grid', () => {
    open();
    expect(grid().querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    const first = cellOf('SAVE', 0);
    expect(first.getAttribute('tabindex')).toBe('0');
    act(() => first.focus());
    press('ArrowDown');
    expect(document.activeElement).toBe(cellOf('CANCEL', 0));
    press('ArrowRight');
    expect(document.activeElement).toBe(cellOf('CANCEL', 1));
    press('End');
    expect(document.activeElement).toBe(cellOf('CANCEL', 3));
    press('Home', { ctrlKey: true });
    expect(document.activeElement).toBe(within(grid()).getByRole('columnheader', { name: 'Key' }));
    press('End', { ctrlKey: true });
    expect(document.activeElement).toBe(cellOf('ERROR_TITLE', 3));
    expect(grid().querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it('keeps the focus on its key and language when the filter changes the rows', () => {
    const { store } = open();
    act(() => cellOf('CANCEL', 2).focus());
    act(() => store.updateFilter({ status: 'missing' }));
    expect(cellOf('CANCEL', 2).getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(cellOf('CANCEL', 2));
  });

  it('says when no key matches the filter, and when the bundle has no keys', () => {
    const { store } = open();
    act(() => store.updateFilter({ query: 'xyz' }));
    expect(screen.getByText('Kein Key passt zum Filter.')).toBeTruthy();
    cleanup();
    open({}, { ...model, rows: [] });
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByText('Diese Einheit hat noch keine Keys.')).toBeTruthy();
  });

  it('keeps the grid, its tab stop and the focus when no key matches, and the key when they are back', () => {
    const { store } = open();
    act(() => cellOf('CANCEL', 2).focus());
    act(() => store.updateFilter({ query: 'xyz' }));
    expect(grid().getAttribute('aria-rowcount')).toBe('1');
    expect(grid().querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(grid().contains(document.activeElement)).toBe(true);
    act(() => store.updateFilter({ query: '' }));
    expect(document.activeElement).toBe(cellOf('CANCEL', 2));
  });

  it('goes to the next and the previous open point with Alt+Down and Alt+Up', () => {
    open();
    act(() => cellOf('SAVE', 2).focus());
    press('ArrowDown', { altKey: true });
    expect(document.activeElement).toBe(cellOf('CANCEL', 2));
    // WORKSPACE.TITLE has a finding only in it, not in fr.
    press('ArrowDown', { altKey: true });
    expect(document.activeElement).toBe(cellOf('ERROR_TITLE', 2));
    press('ArrowDown', { altKey: true });
    expect(document.activeElement).toBe(cellOf('ERROR_TITLE', 2));
    press('ArrowUp', { altKey: true });
    expect(document.activeElement).toBe(cellOf('CANCEL', 2));
    // In the key column, a finding in any language counts.
    act(() => within(rowOf('CANCEL')).getByRole('rowheader').focus());
    press('ArrowDown', { altKey: true });
    expect(document.activeElement).toBe(within(rowOf('WORKSPACE.TITLE')).getByRole('rowheader'));
  });

  it('keeps Space from scrolling the table away from the focused cell', () => {
    open();
    act(() => cellOf('SAVE', 1).focus());
    expect(fireEvent.keyDown(cellOf('SAVE', 1), { key: ' ' })).toBe(false);
  });

  it('renders a large bundle in steps', async () => {
    const rows = Array.from({ length: 450 }, (_, index) =>
      row(`KEY_${index}`, {
        de: text(`Text ${index}`),
        'de-informal': text(undefined),
        fr: text(undefined),
        it: text(undefined),
      }),
    );
    open({}, { ...model, rows });
    expect(grid().getAttribute('aria-rowcount')).toBe('451');
    expect(within(grid()).getAllByRole('row').length).toBeLessThan(451);
    await waitFor(() => expect(within(grid()).getAllByRole('row')).toHaveLength(451));
  });

  it('moves the focus to a row that is not rendered yet', () => {
    open({}, { ...model, rows: manyRows(450) });
    act(() => cellOf('KEY_0', 0).focus());
    press('End', { ctrlKey: true });
    expect(document.activeElement).toBe(cellOf('KEY_449', 3));
  });

  it('keeps the focus when a filter moves its row past the rows rendered so far', () => {
    // KEY_300 has a missing text: with "missing", it is the 11th row; with all rows, the 301st.
    const rows = manyRows(450, (index) => index < 10 || index === 300);
    const { store } = open({ filter: { ...DEFAULT_FILTER, status: 'missing' } }, { ...model, rows });
    act(() => cellOf('KEY_300', 2).focus());
    act(() => store.toggleMissing());
    expect(document.activeElement).toBe(cellOf('KEY_300', 2));
    expect(grid().querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it('ignores keys that are not for moving', () => {
    open();
    act(() => cellOf('SAVE', 1).focus());
    press('a');
    expect(document.activeElement).toBe(cellOf('SAVE', 1));
  });

  it('brings the focus back when its cell goes away, but not after it left the grid', () => {
    const { store } = open();
    act(() => cellOf('CANCEL', 2).focus());
    act(() => store.updateFilter({ query: 'SAVE', scope: 'keys' }));
    expect(document.activeElement).toBe(cellOf('SAVE', 0));

    const outside = document.body.appendChild(document.createElement('button'));
    act(() => outside.focus());
    act(() => store.updateFilter({ query: '' }));
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('does not take the focus back after a click beside the controls', async () => {
    const { store } = open();
    act(() => cellOf('SAVE', 1).focus());
    act(() => cellOf('SAVE', 1).blur());
    await Promise.resolve();
    act(() => store.updateFilter({ status: 'findings' }));
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the top key in place when a language is hidden', () => {
    // happy-dom has no layout: rows are 10 px per column high, below a header row of 20 px, in a 200 px view.
    const height = () => 10 * Number(grid().getAttribute('aria-colcount'));
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('grid-head') ? 20 : this.dataset['entry'] ? height() : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return 20 + [...document.querySelectorAll('[data-entry]')].indexOf(this) * height();
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    const rows = Array.from({ length: 10 }, (_, index) =>
      row(`KEY_${index}`, { de: text('a'), 'de-informal': text(undefined), fr: text('b'), it: text('c') }),
    );
    const { store } = open({}, { ...model, rows });
    const scroller = grid().parentElement!;
    // Rows of 50 px: KEY_3 is cut off at the top of the view (190), KEY_4 starts 30 px below it.
    scroller.scrollTop = 170;
    act(() => store.toggleLocale('de-informal'));
    // Rows of 40 px: KEY_4 starts at 180 and again 30 px below the top of the view.
    expect(scroller.scrollTop).toBe(130);
  });

  it('has no accessibility violations', async () => {
    open({ wrap: true });
    const results = await axe.run(document);
    expect(results.violations.map(({ id, nodes }) => `${id}: ${nodes.length}`)).toEqual([]);
  });
});
