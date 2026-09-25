// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_UI_STATE } from '../../../src/shared/protocol';
import { renderEditor } from './support';

const languages = () => within(screen.getByRole('group', { name: 'Sprachen' }));
const view = () => within(screen.getByRole('group', { name: 'Ansicht' }));

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
});
afterEach(cleanup);

describe('toolbar', () => {
  it('shows the view state the host kept', () => {
    const { open } = renderEditor();
    open({ ...DEFAULT_UI_STATE, layout: 'list', wrap: true, hiddenLocales: ['fr'] });
    expect((view().getByRole('radio', { name: 'Liste' }) as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole('checkbox', { name: 'Lange Texte umbrechen' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect((languages().getByRole('checkbox', { name: /^fr/ }) as HTMLInputElement).checked).toBe(false);
  });

  it('switches the layout and tells the host, which keeps it for next time', () => {
    const { open, posted } = renderEditor();
    open();
    expect((view().getByRole('radio', { name: 'Automatisch' }) as HTMLInputElement).checked).toBe(true);
    act(() => void fireEvent.click(view().getByRole('radio', { name: 'Tabelle' })));
    expect((view().getByRole('radio', { name: 'Tabelle' }) as HTMLInputElement).checked).toBe(true);
    expect(posted).toEqual([{ type: 'uiState', state: { ...DEFAULT_UI_STATE, layout: 'table' } }]);
  });

  it('wraps long texts on request', () => {
    const { open, posted } = renderEditor();
    open();
    act(() => void fireEvent.click(screen.getByRole('checkbox', { name: 'Lange Texte umbrechen' })));
    expect(posted).toEqual([{ type: 'uiState', state: { ...DEFAULT_UI_STATE, wrap: true } }]);
  });

  it('undoes the last change with the button and with Ctrl+Z outside text fields', () => {
    const { open, posted } = renderEditor();
    open();
    act(
      () => void fireEvent.click(screen.getByRole('button', { name: 'Letzte Änderung rückgängig machen' })),
    );
    act(() => void fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true }));
    act(
      () =>
        void fireEvent.keyDown(languages().getByRole('checkbox', { name: /^fr/ }), {
          key: 'z',
          ctrlKey: true,
        }),
    );
    // In a text field, Ctrl+Z undoes the typing, not the last change to the files.
    const field = document.body.appendChild(document.createElement('input'));
    act(() => void fireEvent.keyDown(field, { key: 'z', ctrlKey: true }));
    act(() => void fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true }));
    field.remove();
    expect(posted).toEqual([{ type: 'undo' }, { type: 'undo' }, { type: 'undo' }]);
  });
});

describe('language chips', () => {
  it('has one checkbox per language with its marks and open points', () => {
    const { open } = renderEditor();
    open();
    const names = ['de Referenz', 'de-informal Variante', 'fr fehlend: 1 Befunde: 1'];
    expect(languages().getAllByRole('checkbox')).toEqual(
      names.map((name) => languages().getByRole('checkbox', { name })),
    );
  });

  it('hides a language and shows it again', () => {
    const { open, posted } = renderEditor();
    open();
    const fr = languages().getByRole('checkbox', { name: /^fr/ }) as HTMLInputElement;
    expect(fr.checked).toBe(true);
    act(() => void fireEvent.click(fr));
    expect(fr.checked).toBe(false);
    act(() => void fireEvent.click(fr));
    expect(fr.checked).toBe(true);
    expect(posted).toEqual([
      { type: 'uiState', state: { ...DEFAULT_UI_STATE, hiddenLocales: ['fr'] } },
      { type: 'uiState', state: DEFAULT_UI_STATE },
    ]);
  });

  it('is reachable with the keyboard', () => {
    const { open } = renderEditor();
    open();
    for (const box of languages().getAllByRole('checkbox')) {
      expect(box.tagName).toBe('INPUT');
      expect(box.tabIndex).toBe(0);
    }
  });
});

it('has no accessibility violations with the toolbar and the chips', async () => {
  const { open } = renderEditor();
  open({ ...DEFAULT_UI_STATE, layout: 'table', wrap: true, hiddenLocales: ['de-informal'] });
  const results = await axe.run(document);
  expect(results.violations.map(({ id, nodes }) => `${id}: ${nodes.length}`)).toEqual([]);
});
