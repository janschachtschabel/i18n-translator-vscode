// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FILTER } from '../../../src/shared/filter';
import { DEFAULT_UI_STATE, type UiState } from '../../../src/shared/protocol';
import { renderEditor } from './support';

const search = () => within(screen.getByRole('search'));
const field = () => search().getByRole('searchbox', { name: 'Suchen' }) as HTMLInputElement;
const status = () => search().getByRole('status');
const type = (value: string) => act(() => void fireEvent.input(field(), { target: { value } }));
const choose = (name: string, value: string) =>
  act(() => void fireEvent.change(search().getByRole('combobox', { name }), { target: { value } }));
const lastFilter = (posted: readonly unknown[]) =>
  (posted.filter((message) => (message as { type: string }).type === 'uiState').at(-1) as { state: UiState })
    .state.filter;

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
});
afterEach(cleanup);

describe('filter bar', () => {
  it('searches as you type, says how many keys match and tells the host', () => {
    const { open, posted } = renderEditor();
    open();
    expect(status().textContent).toBe('2 von 2 Keys');
    type('speichern');
    expect(status().textContent).toBe('1 von 2 Keys');
    expect(lastFilter(posted)).toEqual({ ...DEFAULT_FILTER, query: 'speichern' });
  });

  it('searches keys, texts, or the texts of one language', () => {
    const { open } = renderEditor();
    open();
    type('speichern');
    choose('Suchen in', 'keys');
    expect(status().textContent).toBe('0 von 2 Keys');
    choose('Suchen in', 'texts:fr');
    expect(status().textContent).toBe('0 von 2 Keys');
    type('enreg');
    expect(status().textContent).toBe('1 von 2 Keys');
    expect(
      search()
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toContain('Texten in de-informal');
  });

  it('marks an invalid regular expression at the field and says why', () => {
    const { open } = renderEditor();
    open();
    act(() => void fireEvent.click(search().getByRole('checkbox', { name: 'Regulärer Ausdruck' })));
    type('(');
    expect(status().textContent).toBe('Der reguläre Ausdruck ist ungültig: Unterminated group');
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(field().getAttribute('aria-describedby')).toBe(status().id);
  });

  it('matches case on request', () => {
    const { open } = renderEditor();
    open();
    type('save');
    expect(status().textContent).toBe('1 von 2 Keys');
    act(
      () => void fireEvent.click(search().getByRole('checkbox', { name: 'Groß-/Kleinschreibung beachten' })),
    );
    expect(status().textContent).toBe('0 von 2 Keys');
  });

  it('shows the keys with missing texts, also with Alt+M', () => {
    const { open } = renderEditor();
    open();
    choose('Zeigen', 'missing');
    expect(status().textContent).toBe('1 von 2 Keys');
    act(() => void fireEvent.keyDown(document.body, { key: 'm', altKey: true }));
    expect(status().textContent).toBe('2 von 2 Keys');
    act(() => void fireEvent.keyDown(document.body, { key: 'm', altKey: true }));
    expect((search().getByRole('combobox', { name: 'Zeigen' }) as HTMLSelectElement).value).toBe('missing');
  });

  it('puts the cursor into the search with Ctrl+F', () => {
    const { open } = renderEditor();
    open();
    act(() => void fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true }));
    expect(document.activeElement).toBe(field());
  });

  it('shows the filter the host kept', () => {
    const { open } = renderEditor();
    open({
      ...DEFAULT_UI_STATE,
      filter: { ...DEFAULT_FILTER, query: 'Abbrechen', scope: 'texts', locale: 'de' },
    });
    expect(field().value).toBe('Abbrechen');
    expect((search().getByRole('combobox', { name: 'Suchen in' }) as HTMLSelectElement).value).toBe(
      'texts:de',
    );
    expect(status().textContent).toBe('1 von 2 Keys');
  });

  it('has no accessibility violations, also with an invalid expression', async () => {
    const { open } = renderEditor();
    open({ ...DEFAULT_UI_STATE, filter: { ...DEFAULT_FILTER, query: '(', regex: true, status: 'findings' } });
    const results = await axe.run(document);
    expect(results.violations.map(({ id, nodes }) => `${id}: ${nodes.length}`)).toEqual([]);
  });
});
