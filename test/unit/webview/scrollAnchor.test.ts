import { describe, expect, it } from 'vitest';
import { anchoredScrollTop, captureAnchor, type RowBox } from '../../../src/webview/state/scrollAnchor';

/** Rows of the given heights, one below the other, named k0, k1, … */
function rows(heights: readonly number[]): RowBox[] {
  let top = 0;
  return heights.map((height, index) => {
    const row = { id: `k${index}`, top, height };
    top += height;
    return row;
  });
}

describe('captureAnchor', () => {
  it('takes the first row whose top (where its key is) is in view, and its distance from the top', () => {
    // k1 (30–60) is cut off at 45; k2 starts 15 px below the top of the view.
    expect(captureAnchor(rows([30, 30, 30, 30]), { top: 45, height: 100 })).toEqual({ id: 'k2', offset: 15 });
  });

  it('takes a row that starts exactly at the top of the view', () => {
    expect(captureAnchor(rows([30, 30, 30]), { top: 30, height: 100 })).toEqual({ id: 'k1', offset: 0 });
  });

  it('takes the row that covers the whole view, as no key is in view', () => {
    expect(captureAnchor(rows([30, 500, 30]), { top: 100, height: 200 })).toEqual({ id: 'k1', offset: -70 });
  });

  it('has no anchor without rows in view', () => {
    expect(captureAnchor([], { top: 0, height: 100 })).toBeUndefined();
    expect(captureAnchor(rows([30, 30]), { top: 60, height: 100 })).toBeUndefined();
  });
});

describe('anchoredScrollTop', () => {
  it('scrolls so that the anchor row is as far from the top as before', () => {
    // Hiding a language made k0 and k1 shorter: k2 now starts at 40 instead of 60.
    expect(anchoredScrollTop({ id: 'k2', offset: 15 }, rows([20, 20, 20]))).toBe(25);
  });

  it('does not scroll above the start', () => {
    expect(anchoredScrollTop({ id: 'k1', offset: 50 }, rows([10, 10]))).toBe(0);
  });

  it('leaves the view alone when the anchor row is gone', () => {
    expect(anchoredScrollTop({ id: 'k9', offset: 0 }, rows([10, 10]))).toBeUndefined();
  });
});
