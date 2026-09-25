import { useLayoutEffect, useRef } from 'preact/hooks';
import type { LocaleView } from '../../../shared/viewModel';
import type { OpenEditor, ShownCell, ShownRow } from '../../state/edits';
import type { EditorStore } from '../../state/store';
import { Field, focusIsLost } from '../field';
import { keyContext } from '../keyContext';
import { memo } from '../memo';
import { useIncrementalCount } from '../useIncrementalCount';
import { entryAttribute, useScrollAnchor } from '../useScrollAnchor';
import './list.css';

interface ListProps {
  store: EditorStore;
  rows: readonly ShownRow[];
  /** The languages each card shows, in this order. */
  locales: readonly LocaleView[];
  /** The code of the reference language, whose texts the editor checks against. */
  reference: string | undefined;
  /** The id of the heading that names the list. */
  labelledBy: string;
}

const NO_TEXT: ShownCell = { value: undefined, issues: [] };

/** Where the focus was in the list: the card by its place, and the language whose field had it. */
interface FocusPlace {
  card: number;
  locale: string | undefined;
}

/**
 * A card per key with a labelled field per language (design §7.4: the form-like alternative to the grid). The
 * page scrolls as a whole, as one scroll area suits narrow editors better than two.
 */
export function List({ store, rows, locales, reference, labelledBy }: ListProps) {
  const list = useRef<HTMLOListElement>(null);
  // Taken once: the key of a table that went while it had the focus.
  const handoff = useRef(store.takeFocusHandoff());
  const handoffRow = handoff.current ? rows.findIndex((row) => row.entryId === handoff.current) + 1 : 0;
  const editor = store.edits.open.value;
  const editorRow = editor ? rows.findIndex((row) => row.entryId === editor.entryId) + 1 : 0;
  const count = useIncrementalCount(rows.length, Math.max(handoffRow, editorRow));
  const page = useRef(document.scrollingElement as HTMLElement | null);
  const focusPlace = useRef<FocusPlace | undefined>(undefined);
  useScrollAnchor(store, page);

  useLayoutEffect(() => {
    const key = handoff.current;
    handoff.current = undefined;
    // An editor that came along from the table has taken the focus already.
    if (key === undefined || list.current?.contains(document.activeElement)) {
      return;
    }
    const card = key
      ? list.current?.querySelector(`[data-entry="${entryAttribute(key)}"]`)
      : list.current?.firstElementChild;
    card?.querySelector<HTMLElement>('h2')?.focus();
  }, []);

  // When the card with the focus goes (e.g. once its missing text is there), the card that takes its place
  // gets the focus, in the field of the same language.
  useLayoutEffect(() => {
    const place = focusPlace.current;
    const cards = list.current?.children;
    if (!place || !cards || cards.length === 0 || !focusIsLost()) {
      return;
    }
    const card = cards[Math.min(place.card, cards.length - 1)]!;
    const field = [...card.querySelectorAll<HTMLElement>('.field-value')].find(
      (candidate) => candidate.dataset['locale'] === place.locale,
    );
    (field ?? card.querySelector<HTMLElement>('h2'))?.focus();
  });

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
    const card = target.closest('li');
    if (card) {
      const locale = target.closest<HTMLElement>('[data-locale]')?.dataset['locale'];
      focusPlace.current = { card: [...list.current!.children].indexOf(card), locale };
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    const target = event.relatedTarget as Node | null;
    if (target !== null) {
      if (!list.current?.contains(target)) {
        focusPlace.current = undefined;
      }
      return;
    }
    // No new target: a click beside the controls, or the card went. Only then does the focus come back.
    const left = event.target as HTMLElement;
    queueMicrotask(() => {
      if (left.isConnected) {
        focusPlace.current = undefined;
      }
    });
  };

  return (
    <ol ref={list} class="cards" aria-labelledby={labelledBy} onFocusIn={onFocusIn} onFocusOut={onFocusOut}>
      {rows.slice(0, count).map((row) => (
        <Card
          key={row.entryId}
          row={row}
          locales={locales}
          store={store}
          reference={reference}
          editor={editor?.entryId === row.entryId ? editor : undefined}
        />
      ))}
    </ol>
  );
}

interface CardProps {
  row: ShownRow;
  locales: readonly LocaleView[];
  store: EditorStore;
  reference: string | undefined;
  /** The open editor, if it is in this card. */
  editor: OpenEditor | undefined;
}

const Card = memo(({ row, locales, store, reference, editor }: CardProps) => {
  const referenceText = reference === undefined ? undefined : row.cells[reference]?.value;
  return (
    <li class="card" data-entry={entryAttribute(row.entryId)} data-vscode-context={keyContext(row.entryId)}>
      {/* It can take the focus, so that the focus has a place when the list replaces the table. */}
      <h2 class="card-key" tabIndex={-1}>
        {row.key}
      </h2>
      <dl class="card-fields">
        {locales.map((locale) => (
          <Field
            key={locale.code}
            store={store}
            row={row}
            locale={locale}
            cell={row.cells[locale.code] ?? NO_TEXT}
            editor={editor?.locale === locale.code ? editor : undefined}
            referenceText={locale.code === reference ? undefined : referenceText}
            place="rows"
          />
        ))}
      </dl>
    </li>
  );
});
