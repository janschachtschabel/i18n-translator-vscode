import { l10n } from '../l10n';
import type { Layout } from '../state/layout';
import { RESULT_ID, SEARCH_FIELD_ID } from './filterBar';

/**
 * Links past the toolbar and the language chips (design §7.4, WCAG 2.4.1): the first stops on the page, shown
 * only while they have the focus. They move the focus themselves, to the grid's tab stop or the first card.
 */
export function SkipLinks({ layout }: { layout: Layout }) {
  const go = (target: () => HTMLElement | null) => (event: MouseEvent) => {
    event.preventDefault();
    target()?.focus();
  };
  return (
    <div class="skip-links">
      <a href={`#${SEARCH_FIELD_ID}`} onClick={go(() => document.getElementById(SEARCH_FIELD_ID))}>
        {l10n.t('Skip to the search')}
      </a>
      <a href={`#${RESULT_ID}`} onClick={go(rows)}>
        {layout === 'table' ? l10n.t('Skip to the table') : l10n.t('Skip to the list')}
      </a>
    </div>
  );
}

/** The grid's tab stop, else the first card, else the line that says why no row is shown. */
function rows(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]') ??
    document.querySelector<HTMLElement>('.cards h2') ??
    document.getElementById(RESULT_ID)
  );
}
