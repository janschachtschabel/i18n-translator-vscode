// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_UI_STATE } from '../../../src/shared/protocol';
import type { BundleViewModel } from '../../../src/shared/viewModel';
import { GERMAN, model, panelState, renderEditor, axeProblems } from './support';

const main = () => within(screen.getByRole('main'));
const notice =
  'common ist nicht mehr im Arbeitsbereich. Die Einheit wurde vielleicht umbenannt, verschoben oder gelöscht.';

beforeEach(() => {
  // The host writes both into the page (webviewHtml); axe checks them.
  document.documentElement.lang = 'de';
  document.title = 'common';
});
afterEach(cleanup);

describe('App', () => {
  it('shows nothing before init, then loads in the language of the interface', () => {
    const { kept, send } = renderEditor();
    expect(screen.getByRole('main').textContent).toBe('');
    send({ type: 'init', l10n: GERMAN, uiState: DEFAULT_UI_STATE, panelState });
    expect(main().getByText('Übersetzungen werden geladen…')).toBeTruthy();
    expect(kept).toEqual([panelState]);
  });

  it('shows the bundle once it arrives', () => {
    const { open } = renderEditor();
    open();
    expect(main().getByRole('heading', { level: 1, name: 'common' })).toBeTruthy();
    expect(main().getByText('Keys: 2 · Sprachen: 3')).toBeTruthy();
  });

  it('says when the bundle is gone and announces it if it was on screen', () => {
    const { open, send } = renderEditor();
    open();
    send({ type: 'missing', name: 'common' });
    expect(main().getByText(notice)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(notice);
  });

  it('does not announce a bundle that was already gone when the editor opened', () => {
    const { send } = renderEditor();
    send({ type: 'init', l10n: GERMAN, uiState: DEFAULT_UI_STATE, panelState });
    send({ type: 'missing', name: 'common' });
    expect(main().getByText(notice)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('falls back to English texts without a translation', () => {
    const { send } = renderEditor();
    send({ type: 'init', l10n: {}, uiState: DEFAULT_UI_STATE, panelState });
    send({ type: 'bundle', model });
    expect(main().getByText('Keys: 2 · Languages: 3')).toBeTruthy();
  });

  it('leads past the controls with skip links, to the search and to the rows', () => {
    const { open } = renderEditor();
    open();
    act(() => void fireEvent.click(screen.getByRole('link', { name: 'Zur Suche' })));
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    act(() => void fireEvent.click(screen.getByRole('link', { name: 'Zur Tabelle' })));
    expect(document.activeElement?.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('grid').contains(document.activeElement)).toBe(true);
  });

  it('shows the findings no cell can show, and marks a language without a file', () => {
    const { open } = renderEditor();
    const withoutFile: BundleViewModel = {
      ...model,
      locales: model.locales.map((locale) =>
        locale.code === 'fr'
          ? {
              ...locale,
              hasFile: false,
              issues: [
                { rule: 'missing-file', severity: 'error', message: 'In common fehlt die Datei für fr.' },
              ],
            }
          : locale,
      ),
    };
    open(DEFAULT_UI_STATE, withoutFile);
    expect(
      within(screen.getByRole('list', { name: 'Weitere Befunde' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['✖ Fehler: In common fehlt die Datei für fr.']);
    expect(screen.getByRole('checkbox', { name: /^fr keine Datei/ })).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { open } = renderEditor();
    open();
    expect(await axeProblems()).toEqual([]);
  });
});
