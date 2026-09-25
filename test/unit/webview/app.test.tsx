// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_UI_STATE } from '../../../src/shared/protocol';
import { GERMAN, model, panelState, renderEditor } from './support';

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

  it('has no accessibility violations', async () => {
    const { open } = renderEditor();
    open();
    const results = await axe.run(document);
    expect(results.violations.map(({ id, nodes }) => `${id}: ${nodes.length}`)).toEqual([]);
  });
});
