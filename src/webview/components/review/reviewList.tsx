import { useLayoutEffect, useRef } from 'preact/hooks';
import type { PlaceholderSyntax } from '../../../core/area/areaDefinition';
import type { LocaleView } from '../../../shared/viewModel';
import { inlineCheck, type CheckLine } from '../../inlineCheck';
import { formatNumber, l10n } from '../../l10n';
import type { Review, ReviewItem, ReviewList as ReviewListData } from '../../state/review';
import type { EditorStore } from '../../state/store';
import '../cellEditor.css';
import { SEVERITY_SYMBOLS, severityWord } from '../cellStatus';
import { EmptyValue } from '../emptyValue';
import { localeName } from '../localeName';
import { memo } from '../memo';
import { useIncrementalCount } from '../useIncrementalCount';
import './review.css';

interface ReviewListProps {
  store: EditorStore;
  list: ReviewListData;
  /** The languages of the bundle, for the names and the `lang` of the texts. */
  locales: readonly LocaleView[];
}

/**
 * The suggestions of a job in place of the rows (K1): progress and the actions on top, then per text its source,
 * its current text, the suggestion to edit with the check of it, and whether to write it.
 */
export function ReviewList({ store, list, locales }: ReviewListProps) {
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { review } = store;
  const { progress } = list;
  const target = locales.find((locale) => locale.code === list.locale);
  const source = locales.find((locale) => locale.code === list.source);
  const count = useIncrementalCount(list.items.length);
  const chosen = list.items.filter((item) => item.chosen).length;
  const running = progress.kind === 'running';

  // The list of a new job takes the place of the rows: its heading takes the focus, so that screen readers say where
  // it is now.
  useLayoutEffect(() => heading.current?.focus(), [list.jobId]);
  // Closing with the focus in it, the list hands it back to the button that starts a fill.
  useLayoutEffect(
    () => () => {
      if (section.current?.contains(document.activeElement)) {
        review.handBackFocus();
      }
    },
    [review],
  );

  return (
    <section ref={section} class="review" aria-labelledby={REVIEW_HEADING_ID}>
      <div class="review-head">
        <h2 id={REVIEW_HEADING_ID} ref={heading} tabIndex={-1}>
          {l10n.t('AI suggestions for {locale}', { locale: target ? localeName(target) : list.locale })}
        </h2>
        <p role="status" class="review-status">
          {statusText(list)}
        </p>
        {progress.kind === 'running' && (
          <progress
            class="review-progress"
            value={progress.done}
            max={progress.total}
            aria-label={l10n.t('Progress')}
          />
        )}
        {list.message !== undefined && (
          <p role="alert" class="review-message">
            <span aria-hidden="true" class="status-symbol error">
              {SEVERITY_SYMBOLS.error}
            </span>{' '}
            <span class="visually-hidden">{severityWord('error')}: </span>
            {list.message}
          </p>
        )}
        <div class="review-actions">
          <button
            type="button"
            class="primary"
            disabled={chosen === 0 || list.applying !== undefined}
            onClick={() => review.apply()}
          >
            {l10n.t('Apply selected ({count})', { count: formatNumber(chosen) })}
          </button>
          {running && (
            <button type="button" onClick={() => review.cancel()}>
              {l10n.t('Cancel')}
            </button>
          )}
          <button type="button" onClick={() => review.discard()}>
            {list.items.length === 0 && !running ? l10n.t('Close') : l10n.t('Discard')}
          </button>
        </div>
      </div>
      {list.items.length > 0 && (
        <ol class="review-items">
          {list.items.slice(0, count).map((item) => (
            <ReviewEntry
              key={item.entryId}
              item={item}
              review={review}
              syntax={store.placeholderSyntax.value}
              locale={target ? localeName(target) : list.locale}
              lang={target?.lang}
              sourceLocale={source ? localeName(source) : list.source}
              sourceLang={source?.lang}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

const REVIEW_HEADING_ID = 'review-heading';

function statusText({ progress, received }: ReviewListData): string {
  const count = formatNumber(received);
  switch (progress.kind) {
    case 'running':
      return l10n.t('Translated: {done} of {total} …', {
        done: formatNumber(progress.done),
        total: formatNumber(progress.total),
      });
    case 'done':
      return progress.missing > 0
        ? l10n.t('Done. Suggestions: {count}, without an answer: {missing}.', {
            count,
            missing: formatNumber(progress.missing),
          })
        : l10n.t('Done. Suggestions: {count}.', { count });
    case 'cancelled':
      return l10n.t('Cancelled. Suggestions: {count}.', { count });
    case 'failed':
      return l10n.t('Stopped: {message}', { message: progress.message });
  }
}

interface EntryProps {
  item: ReviewItem;
  review: Review;
  syntax: PlaceholderSyntax;
  /** The name of the language of the suggestion, and its `lang`. */
  locale: string;
  lang: string | undefined;
  sourceLocale: string;
  sourceLang: string | undefined;
}

/** Renders again only when its item changed: typing in one suggestion leaves the others alone. */
const ReviewEntry = memo(({ item, review, syntax, locale, lang, sourceLocale, sourceLang }: EntryProps) => {
  const notes = notesOf(item, syntax);
  const notesId = `review-notes-${encodeURIComponent(item.entryId)}`;
  return (
    <li class={notes.some((note) => note.severity === 'error') ? 'review-item marked-error' : 'review-item'}>
      <label class="review-choice">
        <input
          type="checkbox"
          checked={item.chosen}
          aria-label={l10n.t('Apply {key}', { key: item.key })}
          onChange={() => review.toggle(item.entryId)}
        />
        <span class="review-key">{item.key}</span>
      </label>
      <p class="review-source">
        <span class="review-label">{l10n.t('Source ({locale}):', { locale: sourceLocale })}</span>{' '}
        <span lang={sourceLang} dir="auto">
          {item.source}
        </span>
      </p>
      {item.before !== null && (
        <p class="review-before">
          <span class="review-label">{l10n.t('Current text:')}</span>{' '}
          {item.before === '' ? (
            <EmptyValue value="" variant={false} />
          ) : (
            <span lang={lang} dir="auto">
              {item.before}
            </span>
          )}
        </p>
      )}
      <textarea
        class="cell-input review-input"
        rows={rowsFor(item.text)}
        value={item.text}
        lang={lang}
        dir="auto"
        aria-label={l10n.t('{key} in {locale}', { key: item.key, locale })}
        aria-describedby={notes.length > 0 ? notesId : undefined}
        onInput={(event) => review.setText(item.entryId, event.currentTarget.value)}
      />
      {notes.length > 0 && (
        <div id={notesId}>
          {notes.map((note) => (
            <p key={note.text} class="editor-note">
              <span aria-hidden="true" class={`status-symbol ${note.severity}`}>
                {note.severity === 'ok' ? '✓' : SEVERITY_SYMBOLS[note.severity]}
              </span>{' '}
              {note.severity !== 'ok' && <span class="visually-hidden">{severityWord(note.severity)}: </span>}
              {note.text}
            </p>
          ))}
        </div>
      )}
    </li>
  );
});

/** Why the last write left the text out, and what the check finds in the suggestion as it is now. */
function notesOf(item: ReviewItem, syntax: PlaceholderSyntax): CheckLine[] {
  const notes: CheckLine[] = [];
  if (item.notSaved !== undefined) {
    notes.push({ severity: 'error', text: l10n.t('Not saved: {message}', { message: item.notSaved }) });
  }
  if (!item.text.trim()) {
    notes.push({ severity: 'error', text: l10n.t('The suggestion is empty; it is not written.') });
  }
  // "As in the reference" would be said of most texts, and the source is not always the reference.
  return [...notes, ...inlineCheck(item.source, item.text, syntax).filter((line) => line.severity !== 'ok')];
}

/**
 * Lines for a text, counting the lines a long one wraps into, as far as fields can grow with their text
 * (`field-sizing`, VS Code 1.92 and later) is not supported; there the field scrolls beyond 10 lines.
 */
function rowsFor(text: string): number {
  const lines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 80)), 0);
  return Math.min(10, lines);
}
