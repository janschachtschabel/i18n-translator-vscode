// @vitest-environment happy-dom
import { act, cleanup, fireEvent } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openWith as open } from './support';

/**
 * The elements Tab stops at, in the order of the page, as a browser finds them: no tabindex -1, nothing
 * disabled or hidden, and of a group of radio buttons only the checked one.
 */
function tabStops(): HTMLElement[] {
  const candidates = document.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  );
  return [...candidates].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute('disabled') &&
      !element.closest('[hidden]') &&
      !(element instanceof HTMLInputElement && element.type === 'radio' && !element.checked),
  );
}

/**
 * Tab as the browser does it, unless the focused element handles the key itself, as the cell editor does. Past
 * the last stop (or before the first), the browser takes the focus out of the page to VS Code: here it comes round.
 */
function tab(shiftKey = false): string {
  const current = document.activeElement as HTMLElement;
  if (fireEvent.keyDown(current, { key: 'Tab', shiftKey })) {
    const stops = tabStops();
    const next = stops[stops.indexOf(current) + (shiftKey ? -1 : 1)] ?? (shiftKey ? stops.at(-1) : stops[0]);
    act(() => next?.focus());
  }
  return focusLine();
}

/** Whether the page leaves Tab to the browser on the focused element: no key handler holds the focus there. */
function leavesTab(shiftKey = false): boolean {
  return fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey });
}

function press(key: string, init: KeyboardEventInit = {}): string {
  act(() => void fireEvent.keyDown(document.activeElement!, { key, ...init }));
  return focusLine();
}

/** Where the focus is, as a short line: role or element, and the name a screen reader would say. */
function focusLine(): string {
  const element = document.activeElement as HTMLElement;
  const role =
    element.getAttribute('role') ??
    (element instanceof HTMLInputElement ? `input:${element.type}` : element.tagName.toLowerCase());
  const label =
    element instanceof HTMLElement && 'labels' in element ? (element.labels as NodeList)[0] : null;
  // A label around its control: its own text, without the control's (the options of a select).
  const labelText = label ? label.textContent!.replace(element.textContent ?? '', '') : element.textContent;
  const name = element.getAttribute('aria-label') ?? labelText ?? '';
  return `${role} ${name.replace(/\s+/g, ' ').trim()}`;
}

/** Tab until the focus is on a stop whose line starts with `prefix`, at most once round the page. */
function tabTo(prefix: string): string {
  for (let step = 0; step < 50; step++) {
    const line = tab();
    if (line.startsWith(prefix)) {
      return line;
    }
  }
  throw new Error(`Tab never reaches ${prefix}`);
}

const TOOLBAR_TO_GRID = [
  'a Zur Suche',
  'a Zur Tabelle',
  'input:radio Automatisch',
  'input:checkbox Lange Texte umbrechen',
  'input:checkbox Details anzeigen',
  'button Key hinzufügen…',
  'button Sprache hinzufügen…',
  'button Letzte Änderung rückgängig machen',
  'input:checkbox de Referenz',
  'input:checkbox de-informal Variante',
  'input:checkbox fr',
  'input:checkbox it',
  'input:search Suchen',
  'select Suchen in',
  'input:checkbox Regulärer Ausdruck',
  'input:checkbox Groß-/Kleinschreibung beachten',
  'select Zeigen',
  'gridcell Speichern',
];

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
  Object.defineProperty(window, 'innerWidth', { value: 1300, configurable: true });
});
afterEach(cleanup);

describe('keyboard walk', () => {
  it('reaches every control with Tab in the order of the page: toolbar, filter, grid, details, and round again', () => {
    open();
    const walk = Array.from({ length: TOOLBAR_TO_GRID.length + 4 }, () => tab());
    expect(walk).toEqual([
      ...TOOLBAR_TO_GRID,
      'button de: Speichern',
      'button de-informal: –kein eigener Text',
      'button fr: Enregistrer',
      'button it: Salva',
    ]);
    // No trap: on the last stop, Tab goes on out of the page, and Shift+Tab on the first.
    expect(leavesTab()).toBe(true);
    expect(tab()).toBe('a Zur Suche');
    expect(leavesTab(true)).toBe(true);
  });

  it('moves in the grid, edits a text, goes on to the details and back, with the keys alone', () => {
    const { posted } = open();
    expect(tabTo('gridcell')).toBe('gridcell Speichern');
    expect([press('ArrowRight'), press('ArrowRight')]).toEqual([
      'gridcell –kein eigener Text',
      'gridcell Enregistrer',
    ]);
    expect(press('Enter')).toBe('textarea SAVE in fr');
    act(() => void fireEvent.input(document.activeElement!, { target: { value: 'Sauver' } }));
    // Tab saves and opens the next text; Esc leaves it and gives the focus back to its cell.
    expect(tab()).toBe('textarea SAVE in it');
    expect(posted.filter((message) => message.type === 'edit')).toEqual([
      expect.objectContaining({ locale: 'fr', value: 'Sauver' }),
    ]);
    expect(press('Escape')).toBe('gridcell Salva');
    // The grid is one stop: Tab leaves it for the details, Shift+Tab comes back to the same cell.
    expect([tab(), tab(), tab(), tab()]).toEqual([
      'button de: Speichern',
      'button de-informal: –kein eigener Text',
      'button fr: Sauver',
      'button it: Salva',
    ]);
    expect([tab(true), tab(true), tab(true), tab(true)].at(-1)).toBe('gridcell Salva');
    expect(tab(true)).toBe('select Zeigen');
  });

  it('reaches the texts of every card in the list, and not the headings, which only take a focus handed over', () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });
    open({ hiddenLocales: ['de-informal', 'it'] });
    expect(tabTo('button de:')).toBe('button de: Speichern');
    expect([tab(), tab(), tab()]).toEqual([
      'button fr: Enregistrer',
      'button de: Abbrechen',
      'button fr: –kein Text',
    ]);
  });
});
