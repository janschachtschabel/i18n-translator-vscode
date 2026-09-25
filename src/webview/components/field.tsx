import { useLayoutEffect, useRef } from 'preact/hooks';
import type { LocaleView } from '../../shared/viewModel';
import { l10n } from '../l10n';
import type { EditorPlace, OpenEditor, ShownCell, ShownRow } from '../state/edits';
import type { EditorStore } from '../state/store';
import { CellEditor } from './cellEditor';
import { SEVERITY_SYMBOLS, severityWord } from './cellStatus';
import { EmptyValue } from './emptyValue';
import './field.css';
import { hintFor } from './findingHints';
import { LocaleLabel } from './localeLabel';

interface FieldProps {
  store: EditorStore;
  row: ShownRow;
  locale: LocaleView;
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
 * opens its editor in its place; each finding comes with how to solve it.
 */
export function Field({ store, row, locale, cell, editor, referenceText, place }: FieldProps) {
  const button = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useLayoutEffect(() => {
    // After Enter or Esc the text takes the focus back; after Tab, the next editor has it.
    if (wasEditing.current && !editor && focusIsLost() && !store.edits.open.peek()) {
      button.current?.focus();
    }
    wasEditing.current = editor !== undefined;
  });
  const cellName = l10n.t('{key} in {locale}', { key: row.key, locale: locale.code });
  return (
    <div class="card-field">
      <dt>
        <LocaleLabel locale={locale} />
      </dt>
      <dd>
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
            data-locale={locale.code}
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
              {issue.rule === 'empty-value' && (
                <button
                  type="button"
                  class="card-action"
                  onClick={() => store.deleteText(row.entryId, locale.code)}
                >
                  {l10n.t('Delete Text')}
                  <span class="visually-hidden"> {cellName}</span>
                </button>
              )}
            </div>
          );
        })}
      </dd>
    </div>
  );
}

/** The focus went with the element that had it. */
export function focusIsLost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}
