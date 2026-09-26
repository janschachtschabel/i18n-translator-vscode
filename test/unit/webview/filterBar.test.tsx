// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTER } from '../../../src/shared/filter';
import { DEFAULT_UI_STATE, type UiState } from '../../../src/shared/protocol';
import { renderEditor, axeProblems, model } from './support';

const search = () => within(screen.getByRole('search'));
const field = () => search().getByRole('searchbox', { name: 'Suchen' }) as HTMLInputElement;
const status = () => document.getElementById('filter-result')!;
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
    expect(status().textContent).toBe('Keys: 2 von 2');
    type('speichern');
    expect(status().textContent).toBe('Keys: 1 von 2');
    expect(lastFilter(posted)).toEqual({ ...DEFAULT_FILTER, query: 'speichern' });
  });

  it('searches keys, texts, or the texts of one language', () => {
    const { open } = renderEditor();
    open();
    type('speichern');
    choose('Suchen in', 'keys');
    expect(status().textContent).toBe('Keys: 0 von 2');
    choose('Suchen in', 'texts:fr');
    expect(status().textContent).toBe('Keys: 0 von 2');
    type('enreg');
    expect(status().textContent).toBe('Keys: 1 von 2');
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
    expect(status().textContent).toBe('✖ Der reguläre Ausdruck ist ungültig: Unterminated group');
    expect(within(status()).getByText('Unterminated group').getAttribute('lang')).toBe('en');
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(field().getAttribute('aria-describedby')).toBe(status().id);
  });

  it('matches case on request', () => {
    const { open } = renderEditor();
    open();
    type('save');
    expect(status().textContent).toBe('Keys: 1 von 2');
    act(
      () => void fireEvent.click(search().getByRole('checkbox', { name: 'Groß-/Kleinschreibung beachten' })),
    );
    expect(status().textContent).toBe('Keys: 0 von 2');
  });

  it('shows the keys with missing texts, also with Alt+M', () => {
    const { open } = renderEditor();
    open();
    choose('Zeigen', 'missing');
    expect(status().textContent).toBe('Keys: 1 von 2');
    act(() => void fireEvent.keyDown(document.body, { key: 'm', altKey: true }));
    expect(status().textContent).toBe('Keys: 2 von 2');
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
    expect(status().textContent).toBe('Keys: 1 von 2');
  });

  it('has no accessibility violations, also with an invalid expression', async () => {
    const { open } = renderEditor();
    open({ ...DEFAULT_UI_STATE, filter: { ...DEFAULT_FILTER, query: '(', regex: true, status: 'findings' } });
    expect(await axeProblems()).toEqual([]);
  });
});

it('shows a kept language that is gone from the bundle as "texts", which is what the filter does', () => {
  const { open } = renderEditor();
  open({
    ...DEFAULT_UI_STATE,
    filter: { ...DEFAULT_FILTER, query: 'Speichern', scope: 'texts', locale: 'xx' },
  });
  expect((screen.getByRole('combobox', { name: 'Suchen in' }) as HTMLSelectElement).value).toBe('texts');
  expect(document.getElementById('filter-result')?.textContent).toBe('Keys: 1 von 2');
});

it('announces the result once typing pauses, not after every key', () => {
  vi.useFakeTimers();
  try {
    const { open } = renderEditor();
    open();
    const live = () => screen.getAllByRole('status').find((region) => !region.closest('[role="search"]'))!;
    const opened = live().textContent;
    type('s');
    type('speichern');
    expect(live().textContent).toBe(opened);
    act(() => void vi.advanceTimersByTime(700));
    expect(live().textContent).toBe('Keys: 1 von 2');
  } finally {
    vi.useRealTimers();
  }
});

// A saved text or a file that changed changes the count too; announcing it then would interrupt (audit F-03).
it('announces the result after changes of the filter only, not after changes of the bundle', () => {
  vi.useFakeTimers();
  try {
    const { open, send } = renderEditor();
    open();
    const live = () => screen.getAllByRole('status').find((region) => !region.closest('[role="search"]'))!;
    const opened = live().textContent;
    send({ type: 'bundle', model: { ...model, rows: model.rows.slice(0, 1) } });
    act(() => void vi.advanceTimersByTime(700));
    expect(live().textContent).toBe(opened);
    // The result of typing is announced all the same when the bundle changes during the pause, as it is then.
    type('speichern');
    act(() => void vi.advanceTimersByTime(300));
    send({ type: 'bundle', model });
    act(() => void vi.advanceTimersByTime(700));
    expect(live().textContent).toBe('Keys: 1 von 2');
  } finally {
    vi.useRealTimers();
  }
});
