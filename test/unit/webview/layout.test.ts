import { describe, expect, it } from 'vitest';
import { layoutFor } from '../../../src/webview/state/layout';

describe('layoutFor', () => {
  it('chooses by width: a table from 900 px, a list below, the compact list up to 480 px', () => {
    expect(layoutFor('auto', 1400)).toBe('table');
    expect(layoutFor('auto', 900)).toBe('table');
    expect(layoutFor('auto', 899)).toBe('list');
    expect(layoutFor('auto', 481)).toBe('list');
    expect(layoutFor('auto', 480)).toBe('compact');
    expect(layoutFor('auto', 320)).toBe('compact');
  });

  it('keeps the layout the user chose, whatever the width', () => {
    expect(layoutFor('table', 320)).toBe('table');
    expect(layoutFor('list', 1400)).toBe('list');
    expect(layoutFor('list', 320)).toBe('list');
  });
});
