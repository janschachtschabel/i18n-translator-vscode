import { describe, expect, it } from 'vitest';
import { keyFromSegments } from '../../../src/core/model/keys';
import { isWebviewToHost } from '../../../src/shared/protocol';

const entryId = keyFromSegments(['WORKSPACE', 'TITLE']).id;
const suggest = { type: 'aiSuggest', requestId: 's1', entryId, locale: 'fr' };

describe('AI messages from the webview', () => {
  it('accepts a request for a suggestion, its cancel, and the request to set the AI up', () => {
    expect(isWebviewToHost(suggest)).toBe(true);
    expect(isWebviewToHost({ type: 'aiCancel', requestId: 's1' })).toBe(true);
    expect(isWebviewToHost({ type: 'aiSetup' })).toBe(true);
  });

  it('checks their fields like those of an edit', () => {
    for (const invalid of [
      { ...suggest, requestId: '' },
      { ...suggest, requestId: 'x'.repeat(201) },
      { ...suggest, entryId: 'no id' },
      { ...suggest, locale: 7 },
      { ...suggest, locale: undefined },
      { type: 'aiCancel' },
      { type: 'aiCancel', requestId: 3 },
    ]) {
      expect(isWebviewToHost(invalid), JSON.stringify(invalid)).toBe(false);
    }
  });
});
