import { useLayoutEffect, useRef } from 'preact/hooks';
import type { LocaleView } from '../../shared/viewModel';
import { l10n } from '../l10n';
import { NO_TEXT, referenceTextOf } from '../state/shownRows';
import type { EditorStore } from '../state/store';
import './details.css';
import { Field } from './field';

const TITLE_ID = 'details-title';

interface DetailsProps {
  store: EditorStore;
  /** All languages of the bundle: the details show the hidden ones too. */
  locales: readonly LocaleView[];
  /** The code of the reference language. */
  reference: string | undefined;
}

/**
 * The details of the table's active key (design §7.1): every language, hidden ones too, with its text to edit,
 * and every finding with its explanation and how to solve it. Beside the table when it is wide, below it when not.
 */
export function Details({ store, locales, reference }: DetailsProps) {
  const aside = useRef<HTMLElement>(null);
  const row = store.detailsRow.value;
  // When the list takes the table's place with the focus in the details, the list gives it to the card of their
  // key, in the field of the same language.
  useLayoutEffect(
    () => () => {
      const key = store.detailsRow.peek()?.entryId;
      const focused = document.activeElement;
      if (key !== undefined && focused && aside.current?.contains(focused)) {
        const locale = focused.closest<HTMLElement>('[data-locale]')?.dataset['locale'] ?? null;
        store.handOffFocus('table', { entryId: key, locale });
      }
    },
    [store],
  );
  const open = store.edits.open.value;
  const editor = open?.place === 'details' && open.entryId === row?.entryId ? open : undefined;
  return (
    <aside ref={aside} class="details" aria-labelledby={TITLE_ID}>
      <h2 id={TITLE_ID} class="details-title">
        {row ? l10n.t('Details: {key}', { key: row.key }) : l10n.t('Details')}
      </h2>
      {row && store.mailPreview.value && (
        <button type="button" class="details-action" onClick={() => store.previewMail(row.entryId)}>
          {l10n.t('Preview Mail')}
        </button>
      )}
      {row ? (
        <dl class="card-fields">
          {locales.map((locale) => (
            <Field
              key={locale.code}
              store={store}
              row={row}
              locale={locale}
              cell={row.cells[locale.code] ?? NO_TEXT}
              editor={editor?.locale === locale.code ? editor : undefined}
              referenceText={referenceTextOf(row, reference, locale.code)}
              place="details"
            />
          ))}
        </dl>
      ) : (
        <p>{l10n.t('Choose a key in the table to see all its texts and findings here.')}</p>
      )}
    </aside>
  );
}
