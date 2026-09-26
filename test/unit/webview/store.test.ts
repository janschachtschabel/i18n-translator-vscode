// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_STATE, type WebviewToHost } from '../../../src/shared/protocol';
import type { BundleViewModel } from '../../../src/shared/viewModel';
import { EditorStore } from '../../../src/webview/state/store';
import { findingsModel, panelState } from './support';

function store() {
  const posted: WebviewToHost[] = [];
  const editor = new EditorStore({
    postMessage: (message) => void posted.push(message),
    setState: () => undefined,
  });
  return { editor, posted };
}

describe('EditorStore', () => {
  it('changes no view state before the host has sent it', () => {
    const { editor, posted } = store();
    editor.updateUiState({ wrap: true });
    editor.toggleMissing();
    expect(posted).toEqual([]);
    expect(editor.uiState.value).toEqual(DEFAULT_UI_STATE);
  });

  it('toggles "missing" only while a bundle is shown', () => {
    const { editor, posted } = store();
    editor.receive({ type: 'init', l10n: {}, uiState: DEFAULT_UI_STATE, panelState });
    editor.receive({ type: 'missing', name: 'common' });
    editor.toggleMissing();
    expect(posted).toEqual([]);
  });

  it('runs a filter before it sends it to be kept, so that one that never ends is never kept', () => {
    const { editor, posted } = store();
    let filtered = false;
    const rows = findingsModel.rows.map((row) => ({
      ...row,
      get key() {
        filtered = true;
        return row.key;
      },
    }));
    const model: BundleViewModel = { ...findingsModel, rows };
    const sentAfterFiltering: boolean[] = [];
    editor.receive({ type: 'init', l10n: {}, uiState: DEFAULT_UI_STATE, panelState });
    editor.receive({ type: 'bundle', model });
    filtered = false;
    const post = posted.push.bind(posted);
    posted.push = (...messages: WebviewToHost[]) => {
      sentAfterFiltering.push(filtered);
      return post(...messages);
    };
    editor.updateFilter({ query: 'SAVE', scope: 'keys' });
    expect(sentAfterFiltering).toEqual([true]);
  });

  it('hands the focus on only to the other layout, once', () => {
    const { editor } = store();
    editor.receive({ type: 'init', l10n: {}, uiState: DEFAULT_UI_STATE, panelState });
    editor.width.value = 1024;
    const place = { entryId: findingsModel.rows[1]!.entryId, locale: 'fr' };
    // The table goes, but no list takes its place (e.g. its last key went): nothing waits for a later list.
    editor.handOffFocus('table', place);
    expect(editor.takeFocusHandoff()).toBeUndefined();
    editor.width.value = 600;
    editor.handOffFocus('list', place);
    expect(editor.takeFocusHandoff()).toBeUndefined();
    editor.handOffFocus('table', place);
    expect(editor.takeFocusHandoff()).toEqual(place);
    expect(editor.takeFocusHandoff()).toBeUndefined();
  });

  it('says which bundle opened once its texts are there, which screen readers do not see appear', () => {
    const { editor } = store();
    editor.receive({ type: 'init', l10n: {}, uiState: DEFAULT_UI_STATE, panelState });
    editor.receive({ type: 'bundle', model: findingsModel });
    expect(editor.announcement.value.text).toBe('common is open. Keys: 4 · Languages: 4');
    const { id } = editor.announcement.value;
    editor.receive({ type: 'bundle', model: findingsModel });
    expect(editor.announcement.value.id).toBe(id);
  });

  it('clears an announcement that is no longer true when the bundle comes back', () => {
    const { editor } = store();
    editor.receive({ type: 'init', l10n: {}, uiState: DEFAULT_UI_STATE, panelState });
    editor.receive({ type: 'bundle', model: findingsModel });
    editor.receive({ type: 'missing', name: 'common' });
    expect(editor.announcement.value.text).not.toBe('');
    editor.receive({ type: 'bundle', model: findingsModel });
    expect(editor.announcement.value.text).toBe('');
  });
});
