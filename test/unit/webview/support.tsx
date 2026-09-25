import { act, render } from '@testing-library/preact';
import german from '../../../l10n/bundle.l10n.de.json';
import type { HostToWebview, PanelState, UiState, WebviewToHost } from '../../../src/shared/protocol';
import { DEFAULT_UI_STATE } from '../../../src/shared/protocol';
import type { BundleViewModel, CellView, LocaleView, RowView } from '../../../src/shared/viewModel';
import { App } from '../../../src/webview/app';
import { EditorStore } from '../../../src/webview/state/store';

/** The German texts of the extension, as the host sends them with `init` in a German VS Code. */
export const GERMAN: Readonly<Record<string, string>> = german;

export const model: BundleViewModel = {
  bundleId: JSON.stringify(['angular', '', 'common']),
  name: 'common',
  locales: [
    { code: 'de', reference: true, variant: false, hasFile: true, missing: 0, findings: 0, issues: [] },
    {
      code: 'de-informal',
      reference: false,
      variant: true,
      hasFile: true,
      missing: 0,
      findings: 0,
      issues: [],
    },
    { code: 'fr', reference: false, variant: false, hasFile: true, missing: 1, findings: 1, issues: [] },
  ],
  rows: [
    {
      entryId: JSON.stringify(['SAVE']),
      key: 'SAVE',
      cells: {
        de: { value: 'Speichern', issues: [] },
        'de-informal': { value: undefined, issues: [] },
        fr: { value: 'Enregistrer', issues: [] },
      },
    },
    {
      entryId: JSON.stringify(['CANCEL']),
      key: 'CANCEL',
      cells: {
        de: { value: 'Abbrechen', issues: [] },
        'de-informal': { value: undefined, issues: [] },
        fr: {
          value: undefined,
          issues: [{ rule: 'missing-key', severity: 'warning', message: 'CANCEL fehlt in fr.' }],
        },
      },
    },
  ],
  issues: [],
};

export const panelState: PanelState = { folder: 'file:///repo', bundleId: model.bundleId };

/** Renders the editor with a host that records what the webview sends and keeps. */
export function renderEditor() {
  const posted: WebviewToHost[] = [];
  const kept: unknown[] = [];
  const store = new EditorStore({
    postMessage: (message) => void posted.push(message),
    setState: (state) => void kept.push(state),
  });
  render(<App store={store} />);
  const send = (message: HostToWebview) => act(() => store.receive(message));
  /** What the host sends when the editor opens: German texts, the view state it kept, the bundle. */
  const open = (uiState: UiState = DEFAULT_UI_STATE, bundle: BundleViewModel = model) => {
    send({ type: 'init', l10n: GERMAN, uiState, panelState });
    send({ type: 'bundle', model: bundle });
  };
  return { store, posted, kept, send, open };
}

export const locale = (code: string, flags: Partial<LocaleView> = {}): LocaleView => ({
  code,
  reference: false,
  variant: false,
  hasFile: true,
  missing: 0,
  findings: 0,
  issues: [],
  ...flags,
});
export const text = (
  value: string | undefined,
  issue?: { rule: string; message: string; severity?: 'error' },
) => ({
  value,
  issues: issue ? [{ severity: 'warning' as const, ...issue }] : [],
});
export const row = (key: string, cells: Record<string, CellView>): RowView => ({
  entryId: JSON.stringify(key.split('.')),
  key,
  cells,
});

/** A bundle with a finding of each kind the editor shows: missing, empty, placeholders. */
export const findingsModel: BundleViewModel = {
  bundleId: JSON.stringify(['angular', '', 'common']),
  name: 'common',
  locales: [
    locale('de', { reference: true }),
    locale('de-informal', { variant: true }),
    locale('fr'),
    locale('it'),
  ],
  rows: [
    row('SAVE', {
      de: text('Speichern'),
      'de-informal': text(undefined),
      fr: text('Enregistrer'),
      it: text('Salva'),
    }),
    row('CANCEL', {
      de: text('Abbrechen'),
      'de-informal': text(undefined),
      fr: text(undefined, { rule: 'missing-key', message: 'CANCEL fehlt in fr.' }),
      it: text('Annulla'),
    }),
    row('WORKSPACE.TITLE', {
      de: text('Arbeitsbereich'),
      'de-informal': text(undefined),
      fr: text('Espace de travail'),
      it: text('', { rule: 'empty-value', message: 'WORKSPACE.TITLE ist in it leer.' }),
    }),
    row('ERROR_TITLE', {
      de: text('Fehler ({{date}})'),
      'de-informal': text(undefined),
      fr: text('Erreur ({{data}})', {
        rule: 'placeholder-mismatch',
        severity: 'error',
        message: 'Die Platzhalter von ERROR_TITLE weichen ab.',
      }),
      it: text(undefined, { rule: 'missing-key', message: 'ERROR_TITLE fehlt in it.' }),
    }),
  ],
  issues: [],
};

/** Opens the editor with a view state that differs from the default in `uiState`. */
export function openWith(uiState: Partial<UiState> = {}, bundle: BundleViewModel = findingsModel) {
  const editor = renderEditor();
  editor.open({ ...DEFAULT_UI_STATE, ...uiState }, bundle);
  return editor;
}
