import { describe, expect, it } from 'vitest';
import { keyFromSegments } from '../../../src/core/model/keys';
import {
  DEFAULT_UI_STATE,
  isPanelState,
  isWebviewToHost,
  MAX_TEXT_LENGTH,
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
const uiState = { layout: 'auto', wrap: false, hiddenLocales: ['de-informal'] };

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
    expect(isWebviewToHost({ ...edit, before: lone })).toBe(false);
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
