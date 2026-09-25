import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { LocaleView } from '../../shared/viewModel';
import { l10n } from '../l10n';
import type { OpenEditor } from '../state/edits';
import type { EditorStore } from '../state/store';
import { SEVERITY_SYMBOLS } from './cellStatus';
import './cellEditor.css';
import { inlineCheck, type CheckLine } from './inlineCheck';

// One editor is open at a time, so these ids are unique.
const ERROR_ID = 'cell-editor-error';
const CHECK_ID = 'cell-editor-check';
const HINT_ID = 'cell-editor-hint';

/** Marks the editors, so that the table and the list know when the focus is in one. */
export const EDITOR_CLASS = 'cell-editor';

interface CellEditorProps {
  store: EditorStore;
  editor: OpenEditor;
  locale: LocaleView;
  /** The dotted key, for the name of the field. */
  keyText: string;
  /** The text in the reference language, to check the typed text against; undefined in the reference itself. */
  referenceText: string | undefined;
}

/**
 * Edits the text of a cell (design §7.2): Enter saves a text of one line, Ctrl+Enter one of several, Tab and
 * Shift+Tab save and go on to the next or the previous cell, Esc cancels. The field grows with its text, so that
 * it never scrolls, and the check under it follows the typing (a status, which screen readers read on changes).
 */
export function CellEditor({ store, editor, locale, keyText, referenceText }: CellEditorProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const { edits } = store;
  const text = edits.draft.value;
  // Decided when editing begins, so that Enter keeps its meaning while typing.
  const [multiline] = useState(() => text.includes('\n'));
  const check = useMemo(() => inlineCheck(referenceText, text), [referenceText, text]);

  useLayoutEffect(() => {
    const element = field.current!;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);
  useLayoutEffect(() => grow(field.current!), [text]);

  const onKeyDown = (event: KeyboardEvent) => {
    // Enter picks a word while an input method composes it.
    if (event.isComposing) {
      return;
    }
    const command = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape' && !command && !event.altKey && !event.shiftKey) {
      handled(event);
      edits.cancel();
    } else if (event.key === 'Tab' && !command && !event.altKey) {
      handled(event);
      store.editNext(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Enter' && !event.altKey && !event.shiftKey && (command || !multiline)) {
      handled(event);
      edits.commit();
    }
  };
  // Leaving the field saves it, e.g. with a click elsewhere. It does not when the focus is still in an editor:
  // this one, when VS Code took the focus from the page (the field gets it back later), or the one that took
  // its place, when the list replaced the table.
  const onBlur = () => {
    setTimeout(() => {
      if (!document.activeElement?.closest(`.${EDITOR_CLASS}`) && edits.open.peek() === editor) {
        edits.commit();
      }
    }, 0);
  };

  const describedBy = [editor.error !== undefined && ERROR_ID, CHECK_ID, HINT_ID].filter(Boolean).join(' ');
  return (
    <div class={EDITOR_CLASS}>
      <textarea
        ref={field}
        class="cell-input"
        rows={1}
        value={text}
        lang={locale.lang}
        dir="auto"
        aria-label={l10n.t('{key} in {locale}', { key: keyText, locale: locale.code })}
        aria-describedby={describedBy}
        onInput={(event) => {
          edits.draft.value = event.currentTarget.value;
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      {editor.error !== undefined && (
        <p id={ERROR_ID} class="editor-note">
          <span aria-hidden="true" class="status-symbol error">
            {SEVERITY_SYMBOLS.error}
          </span>{' '}
          {l10n.t('Not saved: {message}', { message: editor.error })}
        </p>
      )}
      <div id={CHECK_ID} role="status" class="editor-check">
        {check.map((line) => (
          <p key={line.text} class="editor-note">
            <span aria-hidden="true" class={`status-symbol ${line.severity}`}>
              {symbolOf(line)}
            </span>{' '}
            {line.text}
          </p>
        ))}
      </div>
      <p id={HINT_ID} class="editor-note editor-hint">
        {multiline
          ? l10n.t('Ctrl+Enter saves, Tab saves and goes on, Esc cancels.')
          : l10n.t('Enter saves, Shift+Enter starts a new line, Tab saves and goes on, Esc cancels.')}
      </p>
    </div>
  );
}

function symbolOf(line: CheckLine): string {
  return line.severity === 'ok' ? '✓' : SEVERITY_SYMBOLS[line.severity];
}

/** The key is the editor's: the grid and VS Code must not act on it as well. */
function handled(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

/** Makes the field as high as its text (design §7.1: never scroll inside a cell); without a layout, it keeps one line. */
function grow(field: HTMLTextAreaElement): void {
  field.style.height = 'auto';
  if (field.scrollHeight > 0) {
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }
}
