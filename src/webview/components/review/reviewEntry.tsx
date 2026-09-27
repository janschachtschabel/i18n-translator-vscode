import type { PlaceholderSyntax } from '../../../core/area/areaDefinition';
import { isText } from '../../../shared/messageChecks';
import { inlineCheck, type CheckLine } from '../../inlineCheck';
import { l10n } from '../../l10n';
import { writable, type Review, type ReviewItem } from '../../state/review';
import { SEVERITY_SYMBOLS, severityWord } from '../cellStatus';
import { EmptyValue } from '../emptyValue';
import { memo } from '../memo';

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

/**
 * A text of the review list: whether to write it, what the check found in it, its source and current text, the
 * suggestion or correction to edit, and what the check of typed text finds in that. Renders again only when its
 * item changed: typing in one text leaves the others alone.
 */
export const ReviewEntry = memo(
  ({ item, review, syntax, locale, lang, sourceLocale, sourceLang }: EntryProps) => {
    const notes = notesOf(item, syntax);
    const id = encodeURIComponent(item.entryId);
    const sourceId = `review-source-${id}`;
    const beforeId = `review-before-${id}`;
    const problemId = `review-problem-${id}`;
    const notesId = `review-notes-${id}`;
    // Why a text is left out, on its checkbox too; the field is described by what it translates or corrects first.
    const reasons = [item.problem && problemId, notes.length > 0 && notesId].filter(Boolean).join(' ');
    const described = [sourceId, item.before !== null && beforeId, reasons].filter(Boolean).join(' ');
    const mark = markOf([
      ...(item.problem ? [item.problem.severity] : []),
      ...notes.map((note) => note.severity),
    ]);
    return (
      <li class={mark ? `review-item marked-${mark}` : 'review-item'}>
        <label class="option">
          <input
            type="checkbox"
            checked={item.chosen}
            // An empty text, or the one the cell has, leaves nothing to write.
            disabled={!writable(item)}
            aria-label={l10n.t('Apply {key}', { key: item.key })}
            aria-describedby={reasons || undefined}
            onChange={() => review.toggle(item.entryId)}
          />
          <span class="review-key">{item.key}</span>
        </label>
        {item.problem && (
          <p id={problemId} class="review-problem">
            <Note severity={item.problem.severity} text={item.problem.message} />
          </p>
        )}
        <p id={sourceId} class="review-source">
          <span class="review-label">{l10n.t('Source ({locale}):', { locale: sourceLocale })}</span>{' '}
          <span lang={sourceLang} dir="auto">
            {item.source}
          </span>
        </p>
        {item.before !== null && (
          <p id={beforeId} class="review-before">
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
          aria-describedby={described}
          onInput={(event) => review.setText(item.entryId, event.currentTarget.value)}
        />
        {notes.length > 0 && (
          <div id={notesId}>
            {notes.map((note) => (
              <p key={note.text} class="editor-note">
                <Note severity={note.severity} text={note.text} />
              </p>
            ))}
          </div>
        )}
      </li>
    );
  },
);

/** A symbol and a text; screen readers get the severity in words instead of the symbol. */
function Note({ severity, text }: CheckLine) {
  return (
    <>
      <span aria-hidden="true" class={`status-symbol ${severity}`}>
        {severity === 'ok' ? '✓' : SEVERITY_SYMBOLS[severity]}
      </span>{' '}
      {severity !== 'ok' && <span class="visually-hidden">{severityWord(severity)}: </span>}
      {text}
    </>
  );
}

/**
 * Why the last write left the text out, why it cannot be chosen, and what the check of typed text finds in the
 * suggestion as it is now.
 */
function notesOf(item: ReviewItem, syntax: PlaceholderSyntax): CheckLine[] {
  const notes: CheckLine[] = [];
  if (item.notSaved !== undefined) {
    notes.push({ severity: 'error', text: l10n.t('Not saved: {message}', { message: item.notSaved }) });
  }
  if (!item.text.trim()) {
    notes.push({ severity: 'error', text: l10n.t('The suggestion is empty; it is not written.') });
  } else if (!isText(item.text)) {
    notes.push({
      severity: 'error',
      text: l10n.t('The text has a broken character, e.g. half of an emoji; correct it to write the text.'),
    });
  } else if (item.problem && item.text === item.before) {
    notes.push({ severity: 'info', text: l10n.t('No correction; edit the text to write one.') });
  }
  // "As in the reference" would be said of most texts, and the source is not always the reference.
  return [...notes, ...inlineCheck(item.source, item.text, syntax).filter((line) => line.severity !== 'ok')];
}

/** How a text is marked: by its most severe note; notes of style mark nothing. */
function markOf(severities: readonly CheckLine['severity'][]): 'error' | 'warning' | undefined {
  if (severities.includes('error')) {
    return 'error';
  }
  return severities.includes('warning') ? 'warning' : undefined;
}

/**
 * Lines for a text, counting the lines a long one wraps into, as far as fields can grow with their text
 * (`field-sizing`, VS Code 1.92 and later) is not supported; there the field scrolls beyond 10 lines.
 */
function rowsFor(text: string): number {
  const lines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 80)), 0);
  return Math.min(10, lines);
}
