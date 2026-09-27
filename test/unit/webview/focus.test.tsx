// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/preact';
import { useRef } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusFallback } from '../../../src/webview/components/focus';

afterEach(cleanup);

/** A button that goes when `gone` is set, and the targets that may take the focus it had, in order. */
function Panel({ gone, when = true, first = true }: { gone: boolean; when?: boolean; first?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const second = useRef<HTMLParagraphElement>(null);
  useFocusFallback(
    () => [first ? heading.current : null, second.current],
    [gone],
    () => when,
  );
  return (
    <div>
      <h2 ref={heading} tabIndex={-1}>
        Heading
      </h2>
      <p ref={second} tabIndex={-1}>
        Second
      </p>
      {!gone && <button type="button">Goes</button>}
      <input aria-label="Elsewhere" />
    </div>
  );
}

// Seven components had a rule each for the focus that goes with an element (audit M-07).
describe('useFocusFallback', () => {
  it('gives the focus that went with an element to the first target there is', () => {
    const { rerender } = render(<Panel gone={false} />);
    screen.getByRole('button').focus();
    act(() => rerender(<Panel gone />));
    expect(document.activeElement).toBe(screen.getByRole('heading'));
  });

  it('takes the next target when the first is not there', () => {
    const { rerender } = render(<Panel gone={false} first={false} />);
    screen.getByRole('button').focus();
    act(() => rerender(<Panel gone first={false} />));
    expect(document.activeElement).toBe(screen.getByText('Second'));
  });

  it('leaves a focus the user took elsewhere, and one it was not asked to catch', () => {
    const { rerender } = render(<Panel gone={false} />);
    screen.getByLabelText('Elsewhere').focus();
    act(() => rerender(<Panel gone />));
    expect(document.activeElement).toBe(screen.getByLabelText('Elsewhere'));

    const other = render(<Panel gone={false} when={false} />);
    other.getByRole('button').focus();
    act(() => other.rerender(<Panel gone when={false} />));
    expect(document.activeElement).toBe(document.body);
  });
});
