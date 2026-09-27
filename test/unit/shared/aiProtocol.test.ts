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

  it('accepts filling and the reviewed texts to write, within bounds', () => {
    expect(isWebviewToHost({ type: 'aiFill' })).toBe(true);
    expect(isWebviewToHost({ type: 'aiCheck' })).toBe(true);
    const item = { entryId, value: 'Espace de travail', before: null };
    const apply = {
      type: 'aiApply',
      requestId: 'a1',
      jobId: 'fill-1',
      items: [item, { ...item, before: '' }],
    };
    expect(isWebviewToHost(apply)).toBe(true);
    for (const invalid of [
      { ...apply, jobId: '' },
      { ...apply, items: 'all' },
      { ...apply, items: [{ ...item, entryId: 'no id' }] },
      { ...apply, items: [{ ...item, value: 7 }] },
      { ...apply, items: [{ ...item, value: 'x'.repeat(100_001) }] },
      { ...apply, items: [{ ...item, before: 3 }] },
      { ...apply, items: Array.from({ length: 2001 }, () => item) },
    ]) {
      expect(isWebviewToHost(invalid)).toBe(false);
    }
  });
});
