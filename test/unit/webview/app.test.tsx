// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_UI_STATE, type HostToWebview, type WebviewToHost } from '../../../src/shared/protocol';
import type { BundleViewModel } from '../../../src/shared/viewModel';
import { App } from '../../../src/webview/app';
import { EditorStore } from '../../../src/webview/state/store';

const model: BundleViewModel = {
  bundleId: JSON.stringify(['angular', '', 'common']),
  name: 'common',
  locales: [
    { code: 'de', reference: true, variant: false, hasFile: true, missing: 0, findings: 0, issues: [] },
    { code: 'fr', reference: false, variant: false, hasFile: true, missing: 1, findings: 1, issues: [] },
  ],
  rows: [
    {
      entryId: JSON.stringify(['SAVE']),
      key: 'SAVE',
      cells: {
        de: { value: 'Speichern', issues: [] },
        fr: { value: 'Enregistrer', issues: [] },
      },
    },
    {
      entryId: JSON.stringify(['CANCEL']),
      key: 'CANCEL',
      cells: {
        de: { value: 'Abbrechen', issues: [] },
        fr: {
          value: undefined,
          issues: [{ rule: 'missing-key', severity: 'warning', message: 'CANCEL is missing in fr.' }],
        },
      },
    },
  ],
  issues: [],
};

const panelState = { folder: 'file:///repo', bundleId: model.bundleId };
const GERMAN = {
  'Loading translations…': 'Übersetzungen werden geladen…',
  'Keys: {keys} · Languages: {languages}': 'Keys: {keys} · Sprachen: {languages}',
  '{name} is no longer in the workspace. It may have been renamed, moved or deleted.':
    '{name} ist nicht mehr im Arbeitsbereich. Die Einheit wurde vielleicht umbenannt, verschoben oder gelöscht.',
};

function setup() {
  const posted: WebviewToHost[] = [];
  const kept: unknown[] = [];
  const store = new EditorStore({
    postMessage: (message) => void posted.push(message),
    setState: (state) => void kept.push(state),
  });
  render(<App store={store} />);
  const send = (message: HostToWebview) => act(() => store.receive(message));
  return { posted, kept, send };
}

const main = () => within(screen.getByRole('main'));

beforeEach(() => {
  // The host writes both into the page (webviewHtml); axe checks them.
  document.documentElement.lang = 'de';
  document.title = 'common';
});
afterEach(cleanup);

describe('App', () => {
  it('shows nothing before init, then loads in the language of the interface', () => {
    const { kept, send } = setup();
    expect(screen.getByRole('main').textContent).toBe('');
    send({ type: 'init', l10n: GERMAN, uiState: DEFAULT_UI_STATE, panelState });
    expect(main().getByText('Übersetzungen werden geladen…')).toBeTruthy();
    expect(kept).toEqual([panelState]);
  });

  it('shows the bundle once it arrives', () => {
    const { send } = setup();
    send({ type: 'init', l10n: GERMAN, uiState: DEFAULT_UI_STATE, panelState });
    send({ type: 'bundle', model });
    expect(main().getByRole('heading', { level: 1, name: 'common' })).toBeTruthy();
    expect(main().getByText('Keys: 2 · Sprachen: 2')).toBeTruthy();
  });

  it('says when the bundle is gone and announces it if it was on screen', () => {
    const { send } = setup();
    send({ type: 'init', l10n: GERMAN, uiState: DEFAULT_UI_STATE, panelState });
    send({ type: 'bundle', model });
    send({ type: 'missing', name: 'common' });
    const notice =
      'common ist nicht mehr im Arbeitsbereich. Die Einheit wurde vielleicht umbenannt, verschoben oder gelöscht.';
    expect(main().getByText(notice)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(notice);
  });

  it('does not announce a bundle that was already gone when the editor opened', () => {
    const { send } = setup();
    send({ type: 'init', l10n: GERMAN, uiState: DEFAULT_UI_STATE, panelState });
    send({ type: 'missing', name: 'common' });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('falls back to English texts without a translation', () => {
    const { send } = setup();
    send({ type: 'init', l10n: {}, uiState: DEFAULT_UI_STATE, panelState });
    send({ type: 'bundle', model });
    expect(main().getByText('Keys: 2 · Languages: 2')).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { send } = setup();
    send({ type: 'init', l10n: GERMAN, uiState: DEFAULT_UI_STATE, panelState });
    send({ type: 'bundle', model });
    const results = await axe.run(document);
    expect(results.violations.map(({ id, nodes }) => `${id}: ${nodes.length}`)).toEqual([]);
  });
});
