import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { OpenEditor } from '../../state/edits';
import { NO_TEXT, referenceTextOf, type ShownRow } from '../../state/shownRows';
import type { EditorStore, LocaleColumn } from '../../state/store';
import { Field } from '../field';
import { focusIsLost, onFocusLeaving } from '../focus';
import { keyContext } from '../keyContext';
import { memo } from '../memo';
import { useIncrementalCount } from '../useIncrementalCount';
import { entryAttribute, useScrollAnchor } from '../useScrollAnchor';
import './list.css';

interface ListProps {
  store: EditorStore;
  rows: readonly ShownRow[];
  /** The languages each card shows, in this order. */
  locales: readonly LocaleColumn[];
  /** The code of the reference language, whose texts the editor checks against. */
  reference: string | undefined;
  /** The id of the heading that names the list. */
  labelledBy: string;
}

/** Where the focus was in the list: the card by its key and its place, and the language whose field had it. */
interface FocusPlace {
  entryId: string;
  card: number;
  locale: string | null;
}

/**
 * A card per key with a labelled field per language (design §7.4: the form-like alternative to the grid). The
 * page scrolls as a whole, as one scroll area suits narrow editors better than two.
 */
export function List({ store, rows, locales, reference, labelledBy }: ListProps) {
  const list = useRef<HTMLOListElement>(null);
  // Taken once, on the first render (Preact unmounts the old layout first): where the focus was in the table.
  const [handoff] = useState(() => store.takeFocusHandoff());
  const handoffKey = handoff?.entryId;
  const handoffRow = handoffKey ? rows.findIndex((row) => row.entryId === handoffKey) + 1 : 0;
  const open = store.edits.open.value;
  const editorRow = open ? rows.findIndex((row) => row.entryId === open.entryId) + 1 : 0;
  const count = useIncrementalCount(rows.length, Math.max(handoffRow, editorRow));
  const page = useRef(document.scrollingElement as HTMLElement | null);
  const focusPlace = useRef<FocusPlace | undefined>(undefined);
  useScrollAnchor(store, page);

  // The card of the key, in the field of the language, gets the focus the table had. An editor that came along
  // from the table has taken it already.
  useLayoutEffect(() => {
    if (handoff === undefined || !focusIsLost()) {
      return;
    }
    const card =
      handoff.entryId !== null
        ? list.current?.querySelector(`[data-entry="${entryAttribute(handoff.entryId)}"]`)
        : list.current?.firstElementChild;
    if (card) {
      (fieldOf(card, handoff.locale) ?? card.querySelector<HTMLElement>('h2'))?.focus();
    }
  }, [handoff]);

  // When the card with the focus goes (e.g. once its missing text is there), the card that takes its place gets
  // the focus, in the field of the same language; a card that is still there keeps it.
  useLayoutEffect(() => {
    const place = focusPlace.current;
    const cards = list.current?.children;
    if (!place || !cards || cards.length === 0 || !focusIsLost()) {
      return;
    }
    const card =
      list.current!.querySelector(`[data-entry="${entryAttribute(place.entryId)}"]`) ??
      cards[Math.min(place.card, cards.length - 1)]!;
    (fieldOf(card, place.locale) ?? card.querySelector<HTMLElement>('h2'))?.focus();
  });

  // When the table takes the list's place with the focus in it, the table gives it to the key of the card.
  useLayoutEffect(
    () => () => {
      const place = focusPlace.current;
      if (place && list.current?.contains(document.activeElement)) {
        store.handOffFocus('list', { entryId: place.entryId, locale: place.locale });
      }
    },
    [store],
  );

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
    const card = target.closest<HTMLElement>('li');
    if (card) {
      focusPlace.current = {
        entryId: decodeURIComponent(card.dataset['entry'] ?? ''),
        card: [...list.current!.children].indexOf(card),
        locale: target.closest<HTMLElement>('[data-locale]')?.dataset['locale'] ?? null,
      };
    }
  };
  const onFocusOut = (event: FocusEvent) =>
    onFocusLeaving(event, list.current, () => {
      focusPlace.current = undefined;
    });

  return (
    <ol ref={list} class="cards" aria-labelledby={labelledBy} onFocusIn={onFocusIn} onFocusOut={onFocusOut}>
      {rows.slice(0, count).map((row) => (
        <Card
          key={row.entryId}
          row={row}
          locales={locales}
          store={store}
          reference={reference}
          editor={open && open.entryId === row.entryId ? open : undefined}
        />
      ))}
    </ol>
  );
}

/** The text of a card's field in a language; undefined in the key, or for a language the card does not show. */
function fieldOf(card: Element, locale: string | null): HTMLElement | undefined {
  return (
    [...card.querySelectorAll<HTMLElement>('dd[data-locale]')]
      .find((candidate) => candidate.dataset['locale'] === locale)
      ?.querySelector<HTMLElement>('.field-value') ?? undefined
  );
}

interface CardProps {
  row: ShownRow;
  locales: readonly LocaleColumn[];
  store: EditorStore;
  reference: string | undefined;
  /** The open editor, if it is in this card; the list has no details, so it shows theirs too. */
  editor: OpenEditor | undefined;
}

const Card = memo(({ row, locales, store, reference, editor }: CardProps) => (
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
          referenceText={referenceTextOf(row, reference, locale.code)}
          place="rows"
        />
      ))}
    </dl>
  </li>
));
