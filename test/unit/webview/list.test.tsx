// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UiState } from '../../../src/shared/protocol';
import { openWith as open } from './support';

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
    expect(definitionOf('CANCEL', 2).textContent).toBe('⚠ CANCEL fehlt in fr.');
    expect(definitionOf('ERROR_TITLE', 2).textContent).toBe(
      'Erreur ({{data}})✖ Die Platzhalter von ERROR_TITLE weichen ab.',
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

  it('has no accessibility violations, full or compact', async () => {
    setWidth(600);
    open();
    expect((await axe.run(document)).violations.map(({ id }) => id)).toEqual([]);
    setWidth(400);
    expect((await axe.run(document)).violations.map(({ id }) => id)).toEqual([]);
  });
});
