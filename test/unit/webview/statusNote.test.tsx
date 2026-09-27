// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusNote, StatusSymbol } from '../../../src/webview/components/statusNote';
import { setTranslations } from '../../../src/webview/l10n';
import { GERMAN } from './support';

beforeEach(() => setTranslations(GERMAN));
afterEach(cleanup);

// The markup that eleven places wrote each on their own (audit M-07): the tests of the components rely on it.
describe('StatusSymbol and StatusNote', () => {
  it('show the symbol of a severity, which screen readers skip', () => {
    const { container } = render(<StatusSymbol severity="warning" />);
    expect(container.innerHTML).toBe('<span aria-hidden="true" class="status-symbol warning">⚠</span>');
  });

  it('say the severity to screen readers in words, before the text', () => {
    const { container } = render(
      <p>
        <StatusNote severity="error" text="Kaputt" />
      </p>,
    );
    expect(container.innerHTML).toBe(
      '<p><span aria-hidden="true" class="status-symbol error">✖</span> <span class="visually-hidden">Fehler: </span>Kaputt</p>',
    );
  });

  it('mark a text without a finding with a check mark, and no word', () => {
    const { container } = render(
      <p>
        <StatusNote severity="ok" text="Wie in der Referenz." />
      </p>,
    );
    expect(container.innerHTML).toBe(
      '<p><span aria-hidden="true" class="status-symbol ok">✓</span> Wie in der Referenz.</p>',
    );
  });
});
