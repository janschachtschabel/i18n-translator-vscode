import { useLayoutEffect, useRef } from 'preact/hooks';
import type { LocaleView } from '../../../shared/viewModel';
import { formatNumber, l10n } from '../../l10n';
import { writable, type ReviewList as ReviewListData } from '../../state/review';
import type { EditorStore } from '../../state/store';
import '../cellEditor.css';
import { StatusNote } from '../statusNote';
import { focusIsLost, useFocusFallback } from '../focus';
import { localeName } from '../localeName';
import { useIncrementalCount } from '../useIncrementalCount';
import './review.css';
import { ReviewEntry } from './reviewEntry';

interface ReviewListProps {
  store: EditorStore;
  list: ReviewListData;
  /** The languages of the bundle, for the names and the `lang` of the texts. */
  locales: readonly LocaleView[];
}

/**
 * The suggestions of a job in place of the rows (K1): progress and the actions on top, then per text what a check
 * found, its source, its current text, the suggestion or correction to edit with the check of it, and whether to
 * write it.
 */
export function ReviewList({ store, list, locales }: ReviewListProps) {
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const { review } = store;
  const { progress } = list;
  const target = locales.find((locale) => locale.code === list.locale);
  const source = locales.find((locale) => locale.code === list.source);
  const count = useIncrementalCount(list.items.length);
  const chosen = list.items.filter((item) => item.chosen).length;
  const allChosen = list.items.every((item) => item.chosen || !writable(item));
  // While the write is on its way, nothing changes what it writes or what the list says of it.
  const applying = list.applying !== undefined;
  const running = progress.kind === 'running';
  const kind = useRef(list.kind);
  kind.current = list.kind;
  const name = target ? localeName(target) : list.locale;

  // The list of a new job takes the place of the rows: its heading takes the focus, so that screen readers say where
  // it is now.
  useLayoutEffect(() => heading.current?.focus(), [list.jobId]);
  // The page keeps a focused field below the head (review.css), whose height varies: a message, buttons in two rows.
  useLayoutEffect(() => {
    const element = head.current;
    if (!element) {
      return undefined;
    }
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--review-head-size', `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--review-head-size');
    };
  }, []);
  // What had the focus may go while the list stays: Cancel when the job ends, a written entry, the choice buttons
  // with the last entry. The focus goes to the heading then, not to the page.
  useFocusFallback(() => [heading.current], [running, list.items.length]);
  // Closing with the focus in it, or lost, the list hands it back to the button that started its job.
  useLayoutEffect(
    () => () => {
      if (section.current?.contains(document.activeElement) || focusIsLost()) {
        review.handBackFocus(kind.current);
      }
    },
    [review],
  );

  return (
    <section ref={section} class="review" aria-labelledby={REVIEW_HEADING_ID}>
      <div class="review-head" ref={head}>
        <h2 id={REVIEW_HEADING_ID} ref={heading} tabIndex={-1}>
          {list.kind === 'check'
            ? l10n.t('AI check of {locale}', { locale: name })
            : l10n.t('AI suggestions for {locale}', { locale: name })}
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
            <StatusNote severity="error" text={list.message} />
          </p>
        )}
        <div class="review-actions">
          {/* Unavailable buttons stay focusable (aria-disabled): a focused button that became disabled would lose
              the focus, e.g. Apply while its write is on its way. */}
          <button
            type="button"
            class="primary"
            aria-disabled={chosen === 0 || applying}
            onClick={() => review.apply()}
          >
            {l10n.t('Apply selected ({count})', { count: formatNumber(chosen) })}
          </button>
          {list.items.length > 0 && (
            <>
              <button
                type="button"
                aria-disabled={allChosen || applying}
                onClick={() => review.chooseAll(true)}
              >
                {l10n.t('Select All')}
              </button>
              <button
                type="button"
                aria-disabled={chosen === 0 || applying}
                onClick={() => review.chooseAll(false)}
              >
                {l10n.t('Select None')}
              </button>
            </>
          )}
          {running && (
            <button type="button" onClick={() => review.cancel()}>
              {l10n.t('Cancel')}
            </button>
          )}
          <button type="button" aria-disabled={applying} onClick={() => review.discard()}>
            {list.items.length === 0 && !running ? l10n.t('Close') : l10n.t('Discard')}
          </button>
        </div>
      </div>
      {list.items.length > 0 && (
        <ol class="review-items" inert={applying}>
          {list.items.slice(0, count).map((item) => (
            <ReviewEntry
              key={item.entryId}
              item={item}
              review={review}
              syntax={store.placeholderSyntax.value}
              locale={name}
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

function statusText(list: ReviewListData): string {
  if (list.kind === 'check') {
    return checkStatus(list);
  }
  const { progress, received } = list;
  const count = formatNumber(received);
  switch (progress.kind) {
    case 'running':
      return l10n.t('Translated: {done} of {total} …', {
        done: formatNumber(announced(progress)),
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
      return l10n.t('Failed: {message}', { message: progress.message });
  }
}

/** What a check has done: of how many texts, then what it found, counting the texts without an answer. */
function checkStatus({ progress, received, total }: ReviewListData): string {
  const notes = formatNumber(received);
  switch (progress.kind) {
    case 'running':
      return l10n.t('Checked: {done} of {total} …', {
        done: formatNumber(announced(progress)),
        total: formatNumber(progress.total),
      });
    case 'done':
    case 'cancelled': {
      const checked = total - progress.missing;
      const counts = { checked: formatNumber(checked), fine: formatNumber(checked - received), notes };
      if (progress.kind === 'cancelled') {
        // The texts without an answer were mostly never asked: no count of them.
        return l10n.t('Cancelled. Checked: {checked} · fine: {fine} · notes: {notes}.', counts);
      }
      return progress.missing > 0
        ? l10n.t('Done. Checked: {checked} · fine: {fine} · notes: {notes} · without an answer: {missing}.', {
            ...counts,
            missing: formatNumber(progress.missing),
          })
        : l10n.t('Done. Checked: {checked} · fine: {fine} · notes: {notes}.', counts);
    }
    case 'failed':
      return l10n.t('Failed: {message}', { message: progress.message });
  }
}

/**
 * How many texts the status line says are done: of a long job in tenths, so that screen readers are not interrupted
 * by every chunk (the bar shows each one); of a short one, every text.
 */
function announced({ done, total }: { done: number; total: number }): number {
  const step = Math.max(1, Math.ceil(total / 10));
  return done >= total ? done : Math.floor(done / step) * step;
}
