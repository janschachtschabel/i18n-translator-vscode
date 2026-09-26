// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { options, type VNode } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundleViewModel } from '../../../src/shared/viewModel';
import { locale, openWith as open, row, text } from './support';

const CODES = ['de', 'de-informal', 'de-no-binnen-i', 'en', 'fr', 'it'];

/** A bundle of `count` keys in six languages, the size design §8 asks the editor to handle. */
function largeModel(count: number): BundleViewModel {
  return {
    bundleId: JSON.stringify(['angular', '', 'large']),
    name: 'large',
    locales: CODES.map((code, index) =>
      locale(code, { reference: index === 0, variant: code.startsWith('de-') }),
    ),
    rows: Array.from({ length: count }, (_, index) =>
      row(
        `SECTION_${Math.floor(index / 50)}.KEY_${index}`,
        Object.fromEntries(
          CODES.map((code) => [
            code,
            code === 'fr' && index % 7 === 0 ? text(undefined, 'missing-key') : text(`${code} ${index}`),
          ]),
        ),
      ),
    ),
    issues: [],
  };
}

/** The grid rows Preact renders while `action` runs: a memoized row that stays the same skips its whole subtree. */
function rowsRendered(action: () => void): number {
  let count = 0;
  const previous = options.diffed;
  options.diffed = (vnode: VNode) => {
    if (typeof vnode.type === 'string' && (vnode.props as { role?: string }).role === 'row') {
      count++;
    }
    previous?.(vnode);
  };
  try {
    action();
  } finally {
    options.diffed = previous;
  }
  return count;
}

const bodyRows = () => document.querySelectorAll('.grid-body [role="row"]').length;
const press = (key: string) => act(() => void fireEvent.keyDown(document.activeElement!, { key }));

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'large';
  Object.defineProperty(window, 'innerWidth', { value: 1300, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Rendering 2,000 rows in happy-dom takes 2–3 s alone and more beside other test files; the tests count renders,
// not time.
describe('a bundle of 2,000 keys in six languages', { timeout: 20_000 }, () => {
  it('shows the first 200 rows at once and the others in steps', () => {
    vi.useFakeTimers();
    open({}, largeModel(2000));
    expect(bodyRows()).toBe(200);
    // Each step plans the next once it has rendered.
    for (let step = 0; step < 20 && bodyRows() < 2000; step++) {
      act(() => void vi.runOnlyPendingTimers());
    }
    expect(bodyRows()).toBe(2000);
  });

  it('renders two rows when the focus moves, one for a changed text, and none while typing', () => {
    const model = largeModel(2000);
    const { send } = open({}, model);
    const grid = screen.getByRole('grid');
    act(() => within(grid).getAllByRole('gridcell')[4]!.focus());
    expect(rowsRendered(() => press('ArrowDown'))).toBe(2);

    const changed = model.rows[150]!;
    const patch = { rows: [{ ...changed, cells: { ...changed.cells, fr: text('neu') } }] };
    expect(rowsRendered(() => send({ type: 'patch', patch }))).toBe(1);
    // A filled missing text also changes the counts of its language, which the rows do not show.
    const missing = model.rows[7]!;
    const filled = {
      rows: [{ ...missing, cells: { ...missing.cells, fr: text('fr 7') } }],
      locales: model.locales.map((candidate) => ({ ...candidate, missing: candidate.missing + 1 })),
    };
    expect(rowsRendered(() => send({ type: 'patch', patch: filled }))).toBe(1);

    press('Enter');
    const field = screen.getByRole('textbox');
    expect(
      rowsRendered(() => act(() => void fireEvent.input(field, { target: { value: 'fr 1 neu' } }))),
    ).toBe(0);
  });
});
