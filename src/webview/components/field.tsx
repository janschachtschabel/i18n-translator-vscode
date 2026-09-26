import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import { l10n } from '../l10n';
import type { EditorPlace, OpenEditor } from '../state/edits';
import type { ShownCell, ShownRow } from '../state/shownRows';
import type { EditorStore, LocaleColumn } from '../state/store';
import { CellEditor } from './cellEditor';
import { SEVERITY_SYMBOLS, severityWord } from './cellStatus';
import { EmptyValue } from './emptyValue';
import './field.css';
import { hintFor } from './findingHints';
import { focusIsLost, onFocusLeaving } from './focus';
import { LocaleLabel } from './localeLabel';

interface FieldProps {
  store: EditorStore;
  row: ShownRow;
  locale: LocaleColumn;
  cell: ShownCell;
  /** The open editor, if it is this field's. */
  editor: OpenEditor | undefined;
  /** The text in the reference language, which the editor checks against; undefined in the reference itself. */
  referenceText: string | undefined;
  /** Where the field is: in a card of the list, or in the details. */
  place: EditorPlace;
}

/**
 * A language and its text, as a term and its definition in a card or in the details. The text is a button that
 * opens its editor in its place, described by what the field says about it: each finding with how to solve it.
 */
export function Field({ store, row, locale, cell, editor, referenceText, place }: FieldProps) {
  const button = useRef<HTMLButtonElement>(null);
  const definition = useRef<HTMLElement>(null);
  const wasEditing = useRef(false);
  /** The user took the focus out of the field, e.g. with a click beside its editor, which then saves. */
  const left = useRef(false);
  const notesId = `${useId()}-notes`;
  useLayoutEffect(() => {
    // After Enter or Esc the text takes the focus back; after Tab, the next editor has it; after a click beside
    // the editor, the focus stays where the click put it.
    if (wasEditing.current && !editor && !left.current && focusIsLost() && !store.edits.open.peek()) {
      button.current?.focus();
    }
    wasEditing.current = editor !== undefined;
  });
  const hasNotes = cell.notSaved !== undefined || cell.issues.length > 0;
  const deletable = cell.issues.some((issue) => issue.rule === 'empty-value');
  return (
    <div class="card-field">
      <dt>
        <LocaleLabel locale={locale} />
      </dt>
      {/* The language of every element in it, for the list, which brings the focus back to the same field. */}
      <dd
        ref={definition}
        data-locale={locale.code}
        onFocusIn={() => (left.current = false)}
        onFocusOut={(event) => onFocusLeaving(event, definition.current, () => (left.current = true))}
      >
        {editor ? (
          <CellEditor
            store={store}
            editor={editor}
            locale={locale}
            keyText={row.key}
            referenceText={referenceText}
          />
        ) : (
          <button
            ref={button}
            type="button"
            class="field-value"
            aria-describedby={hasNotes ? notesId : undefined}
            onClick={() => store.edit(row.entryId, locale.code, place)}
          >
            {/* The language names the button with its text; the term before it is not its label. */}
            <span class="visually-hidden">{locale.code}: </span>
            {cell.value !== undefined && cell.value !== '' ? (
              <span class="cell-text" lang={locale.lang} dir="auto">
                {cell.value}
              </span>
            ) : (
              <EmptyValue value={cell.value} variant={locale.variant} />
            )}
          </button>
        )}
        {hasNotes && (
          <div id={notesId}>
            {cell.notSaved !== undefined && (
              <p class="card-finding">
                <span aria-hidden="true" class="status-symbol error">
                  {SEVERITY_SYMBOLS.error}
                </span>{' '}
                {l10n.t('Not saved: {message}', { message: cell.notSaved })}
              </p>
            )}
            {cell.issues.map((issue, index) => {
              const hint = hintFor(issue.rule);
              return (
                <div key={index}>
                  <p class="card-finding">
                    <span aria-hidden="true" class={`status-symbol ${issue.severity}`}>
                      {SEVERITY_SYMBOLS[issue.severity]}
                    </span>{' '}
                    <span class="visually-hidden">{severityWord(issue.severity)}: </span>
                    {issue.message}
                  </p>
                  {hint !== undefined && <p class="card-hint">{hint}</p>}
                </div>
              );
            })}
          </div>
        )}
        {deletable && !editor && (
          <button
            type="button"
            class="card-action"
            onClick={() => {
              // The button goes with its finding once the text is sent: the focus stays on the field's text.
              button.current?.focus();
              store.deleteText(row.entryId, locale.code);
            }}
          >
            {l10n.t('Delete Text')}
            <span class="visually-hidden">
              {' '}
              {l10n.t('{key} in {locale}', { key: row.key, locale: locale.code })}
            </span>
          </button>
        )}
      </dd>
    </div>
  );
}
