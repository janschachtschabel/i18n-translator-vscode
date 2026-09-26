import { describe, expect, it } from 'vitest';
import { keyFromSegments } from '../../../src/core/model/keys';
import {
  copyPanelState,
  copyUiState,
  copyUnsavedTexts,
  DEFAULT_UI_STATE,
  fitUnsavedTexts,
  isPanelState,
  isUiState,
  isUnsavedTexts,
  isWebviewToHost,
  MAX_TEXT_LENGTH,
  MAX_UNSAVED_TEXTS,
  readableEditRequestId,
} from '../../../src/shared/protocol';

const entryId = keyFromSegments(['WORKSPACE', 'TITLE']).id;
const edit = {
  type: 'edit',
  requestId: 'r1',
  entryId,
  locale: 'fr',
  value: 'Espace de travail',
  before: null,
};
const uiState = { ...DEFAULT_UI_STATE, hiddenLocales: ['de-informal'] };
const unsaved = {
  entryId,
  locale: 'fr',
  text: 'Espace',
  message: 'Not saved.',
  shown: null,
  conflict: false,
};

describe('isWebviewToHost', () => {
  it('accepts every message the webview sends', () => {
    for (const message of [
      { type: 'ready' },
      { type: 'undo' },
      edit,
      { ...edit, before: 'Espace' },
      { type: 'command', command: 'addKey', entryId },
      { type: 'command', command: 'addLanguage' },
      { type: 'uiState', state: uiState },
      { type: 'uiState', state: DEFAULT_UI_STATE },
      { type: 'unsaved', texts: [] },
      { type: 'unsaved', texts: [unsaved, { ...unsaved, locale: 'it', shown: 'Area', conflict: true }] },
      // A draft keeps a cut-off character of the file it was typed against; the host only keeps it.
      { type: 'unsaved', texts: [{ ...unsaved, text: `x${String.fromCharCode(0xd800)}` }] },
    ]) {
      expect(isWebviewToHost(message), JSON.stringify(message)).toBe(true);
    }
  });

  it('refuses anything else', () => {
    for (const message of [
      undefined,
      null,
      'ready',
      [],
      {},
      { type: 'unknown' },
      { type: 'command', command: 'format' },
      { type: 'uiState', state: { ...uiState, layout: 'grid' } },
      { type: 'uiState', state: { ...uiState, hiddenLocales: 'de' } },
      { type: 'uiState', state: { ...uiState, hiddenLocales: [''] } },
      { type: 'uiState', state: { ...uiState, wrap: 'yes' } },
      { type: 'uiState', state: { layout: 'auto' } },
      { type: 'uiState', state: null },
      { type: 'unsaved', texts: 'Espace' },
      { type: 'unsaved', texts: [{ ...unsaved, entryId: '' }] },
      { type: 'unsaved', texts: [{ ...unsaved, conflict: 'no' }] },
      { type: 'unsaved', texts: [{ ...unsaved, shown: undefined }] },
      { type: 'unsaved', texts: [{ ...unsaved, text: 'x'.repeat(MAX_TEXT_LENGTH + 1) }] },
      { type: 'unsaved', texts: [{ ...unsaved, message: 'x'.repeat(1001) }] },
    ]) {
      expect(isWebviewToHost(message), JSON.stringify(message)).toBe(false);
    }
  });

  it('checks the fields of an edit', () => {
    const invalid = [
      { ...edit, requestId: 1 },
      { ...edit, requestId: '' },
      { ...edit, entryId: 'WORKSPACE.TITLE' },
      { ...edit, entryId: '[]' },
      { ...edit, entryId: 42 },
      { ...edit, entryId: keyFromSegments(['x'.repeat(10_000)]).id },
      { ...edit, locale: 'x'.repeat(201) },
      { ...edit, value: undefined },
      { ...edit, before: undefined },
      { ...edit, before: 42 },
      { type: 'command', command: 'renameKey', entryId: 'ASK' },
      { type: 'command', command: 'renameKey', entryId: null },
    ];
    for (const message of invalid) {
      expect(isWebviewToHost(message), JSON.stringify(message)).toBe(false);
    }
  });

  it('limits texts and refuses incomplete characters', () => {
    expect(isWebviewToHost({ ...edit, value: 'x'.repeat(MAX_TEXT_LENGTH) })).toBe(true);
    expect(isWebviewToHost({ ...edit, value: 'x'.repeat(MAX_TEXT_LENGTH + 1) })).toBe(false);
    const lone = String.fromCharCode(0xd800);
    expect(isWebviewToHost({ ...edit, value: `a${lone}b` })).toBe(false);
    // The text the cell showed may come from a file that stores a cut-off character as a JSON escape:
    // the edit that repairs it must go through.
    expect(isWebviewToHost({ ...edit, before: `x${lone}` })).toBe(true);
    expect(isWebviewToHost({ ...edit, before: 'x'.repeat(MAX_TEXT_LENGTH + 1) })).toBe(false);
    expect(isWebviewToHost({ ...edit, value: 'Emoji 😀' })).toBe(true);
  });

  it('limits the number of hidden languages', () => {
    const codes = (count: number) => Array.from({ length: count }, (_, index) => `x${index}`);
    expect(isWebviewToHost({ type: 'uiState', state: { ...uiState, hiddenLocales: codes(200) } })).toBe(true);
    expect(isWebviewToHost({ type: 'uiState', state: { ...uiState, hiddenLocales: codes(201) } })).toBe(
      false,
    );
  });
});

// The host keeps them in the workspace state: they are bounded like everything else from the webview (audit L-05).
describe('isUnsavedTexts', () => {
  it('limits the number of texts and their characters', () => {
    expect(isUnsavedTexts(Array.from({ length: MAX_UNSAVED_TEXTS }, () => unsaved))).toBe(true);
    expect(isUnsavedTexts(Array.from({ length: MAX_UNSAVED_TEXTS + 1 }, () => unsaved))).toBe(false);
    const long = (count: number) =>
      Array.from({ length: count }, () => ({ ...unsaved, text: 'x'.repeat(MAX_TEXT_LENGTH) }));
    expect(isUnsavedTexts(long(10))).toBe(true);
    expect(isUnsavedTexts(long(11))).toBe(false);
  });
});

// The host takes the list only as a whole: the webview gives it what fits, so that one text costs no others.
describe('fitUnsavedTexts', () => {
  it('cuts a long reason to the length the host keeps', () => {
    const fitted = fitUnsavedTexts([{ ...unsaved, message: 'x'.repeat(5000) }]);
    expect(fitted.map((text) => text.message.length)).toEqual([1000]);
    expect(isUnsavedTexts(fitted)).toBe(true);
  });

  it('leaves out what the host could not take and keeps the rest', () => {
    const tooLong = { ...unsaved, locale: 'it', text: 'x'.repeat(MAX_TEXT_LENGTH + 1) };
    expect(fitUnsavedTexts([tooLong, unsaved])).toEqual([unsaved]);
    expect(fitUnsavedTexts(Array.from({ length: MAX_UNSAVED_TEXTS + 1 }, () => unsaved))).toHaveLength(
      MAX_UNSAVED_TEXTS,
    );
    const long = Array.from({ length: 11 }, () => ({ ...unsaved, text: 'x'.repeat(MAX_TEXT_LENGTH) }));
    const fitted = fitUnsavedTexts(long);
    expect(fitted).toHaveLength(10);
    expect(isUnsavedTexts(fitted)).toBe(true);
  });
});

describe('readableEditRequestId', () => {
  it('reads the request of an edit even if the rest is invalid, so that the host can answer it', () => {
    expect(readableEditRequestId(edit)).toBe('r1');
    expect(readableEditRequestId({ ...edit, entryId: 'WORKSPACE.TITLE', value: 42 })).toBe('r1');
    expect(readableEditRequestId({ type: 'edit', requestId: 'r2' })).toBe('r2');
  });

  it('reads nothing from other messages or from a request that is not readable itself', () => {
    for (const message of [
      undefined,
      null,
      'edit',
      { type: 'undo', requestId: 'r1' },
      { ...edit, requestId: '' },
      { ...edit, requestId: 1 },
      { ...edit, requestId: 'x'.repeat(201) },
      { requestId: 'r1' },
    ]) {
      expect(readableEditRequestId(message), JSON.stringify(message)).toBeUndefined();
    }
  });
});

describe('isPanelState', () => {
  const bundleId = JSON.stringify(['angular', 'web/src/assets/i18n', 'common']);

  it('accepts the state the host gives the webview to keep', () => {
    expect(isPanelState({ folder: 'file:///c%3A/repo', bundleId })).toBe(true);
  });

  it('refuses anything else, as the state comes back from the webview', () => {
    for (const state of [
      undefined,
      null,
      'common',
      {},
      { folder: 'file:///repo' },
      { folder: 1, bundleId },
      { folder: '', bundleId },
      { folder: 'x'.repeat(10_001), bundleId },
      { folder: 'file:///repo', bundleId: 'common' },
      { folder: 'file:///repo', bundleId: '["angular","common"]' },
      { folder: 'file:///repo', bundleId: '["angular","",3]' },
      { folder: 'file:///repo', bundleId: '[ "angular", "", "common" ]' },
    ]) {
      expect(isPanelState(state), JSON.stringify(state)).toBe(false);
    }
  });
});

describe('isUiState', () => {
  it('accepts a complete view state only, as the host reads it back from the workspace state', () => {
    expect(isUiState(DEFAULT_UI_STATE)).toBe(true);
    const filter = {
      query: 'Speichern',
      scope: 'texts',
      locale: 'de',
      regex: false,
      matchCase: true,
      status: 'missing',
    };
    expect(
      isUiState({
        layout: 'list',
        wrap: true,
        hiddenLocales: ['fr'],
        filter,
        compactLocale: 'it',
        details: false,
      }),
    ).toBe(true);
    for (const state of [
      undefined,
      null,
      {},
      { ...DEFAULT_UI_STATE, layout: 'grid' },
      { layout: 'auto' },
      // View states of 2.8 and 2.9, before the filter and the language of the compact list were part of it.
      { layout: 'list', wrap: true, hiddenLocales: ['fr'] },
      { layout: 'list', wrap: true, hiddenLocales: ['fr'], filter },
      // … and of 2.11, before the details.
      { layout: 'list', wrap: true, hiddenLocales: ['fr'], filter, compactLocale: 'it' },
      { ...DEFAULT_UI_STATE, details: 'yes' },
      { ...DEFAULT_UI_STATE, compactLocale: '' },
      { ...DEFAULT_UI_STATE, compactLocale: 3 },
      { ...DEFAULT_UI_STATE, filter: { ...filter, status: 'open' } },
      { ...DEFAULT_UI_STATE, filter: { ...filter, scope: 'values' } },
      { ...DEFAULT_UI_STATE, filter: { ...filter, locale: '' } },
      { ...DEFAULT_UI_STATE, filter: { ...filter, regex: 'yes' } },
      { ...DEFAULT_UI_STATE, filter: { ...filter, query: 'x'.repeat(1001) } },
    ]) {
      expect(isUiState(state), JSON.stringify(state)).toBe(false);
    }
  });
});

describe('copyUiState and copyPanelState', () => {
  it('keep the known fields only, so that nothing else the webview adds is stored', () => {
    const state = {
      ...DEFAULT_UI_STATE,
      filter: { ...DEFAULT_UI_STATE.filter, extra: 'x'.repeat(10) },
      extra: 1,
    };
    expect(copyUiState(state)).toEqual(DEFAULT_UI_STATE);
    expect(Object.keys(copyUiState(state).filter)).toEqual(Object.keys(DEFAULT_UI_STATE.filter));
    expect(copyPanelState({ folder: 'file:///repo', bundleId: '["a","","b"]', extra: 1 } as never)).toEqual({
      folder: 'file:///repo',
      bundleId: '["a","","b"]',
    });
    expect(copyUnsavedTexts([{ ...unsaved, extra: 1 } as never])).toEqual([unsaved]);
  });
});
