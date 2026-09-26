import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { l10n } from '../l10n';
import type { OpenEditor } from '../state/edits';
import type { EditorStore, LocaleColumn } from '../state/store';
import { SEVERITY_SYMBOLS, severityWord } from './cellStatus';
import './cellEditor.css';
import { focusIsLost } from './focus';
import { inlineCheck, type CheckLine } from './inlineCheck';
import { localeName } from './localeName';
import { trackPointer, whenPointerUp } from './pointer';

// One editor is open at a time, so these ids are unique.
const ERROR_ID = 'cell-editor-error';
const CONFLICT_ID = 'cell-editor-conflict';
const CHECK_ID = 'cell-editor-check';
const HINT_ID = 'cell-editor-hint';

/** Marks the editors, so that the table and the list know when the focus is in one. */
export const EDITOR_CLASS = 'cell-editor';

/** Inside an editor, VS Code's context menu offers no key commands: a rename would take the typed text away. */
const EDITOR_CONTEXT = JSON.stringify({ webviewSection: 'editor' });

interface CellEditorProps {
  store: EditorStore;
  editor: OpenEditor;
  locale: LocaleColumn;
  /** The dotted key, for the name of the field. */
  keyText: string;
  /** The text in the reference language, to check the typed text against; undefined in the reference itself. */
  referenceText: string | undefined;
}

/**
 * Edits the text of a cell (design §7.2): Enter saves a text of one line, Ctrl+Enter one of several, Tab and
 * Shift+Tab save and go on to the next or the previous cell, Esc cancels. The field grows with its text, so that
 * it never scrolls, and the check under it follows the typing (a status, which screen readers read on changes).
 * When the text changed outside the editor, nothing is saved against the old one: Enter and Tab lead to the
 * choice between the new text and the user's.
 */
export function CellEditor({ store, editor, locale, keyText, referenceText }: CellEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const choice = useRef<HTMLButtonElement>(null);
  const { edits } = store;
  const text = edits.draft.value;
  const syntax = store.placeholderSyntax.value;
  const check = useMemo(() => inlineCheck(referenceText, text, syntax), [referenceText, text, syntax]);

  // From the first editor on, a click elsewhere saves when its button comes up (onFocusOut).
  useLayoutEffect(trackPointer, []);
  useLayoutEffect(() => {
    const element = field.current!;
    // At its full height before it takes the focus, so that scrolling it into view shows the cursor at its end.
    grow(element);
    element.focus({ preventScroll: true });
    element.setSelectionRange(element.value.length, element.value.length);
    container.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    // A narrower column wraps the text anew: the field grows again, so that nothing is cut off.
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        grow(element);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => grow(field.current!), [text]);
  // The choice went with the focus on one of its buttons (e.g. the text is back as it was): the field takes it,
  // before the table or the list would give it to the cell or the card.
  useLayoutEffect(() => {
    if (!editor.conflict && focusIsLost()) {
      field.current?.focus();
    }
  }, [editor.conflict]);

  const onFieldKeyDown = (event: KeyboardEvent) => {
    // Enter picks a word while an input method composes it.
    if (event.isComposing) {
      return;
    }
    const command = event.ctrlKey || event.metaKey;
    const save = event.key === 'Enter' && !event.altKey && !event.shiftKey && (command || !editor.multiline);
    if (editor.conflict) {
      if (save) {
        handled(event);
        choice.current?.focus();
      }
      return;
    }
    if (event.key === 'Tab' && !command && !event.altKey) {
      handled(event);
      store.editNext(event.shiftKey ? -1 : 1);
    } else if (save) {
      handled(event);
      edits.commit();
    }
  };
  // Esc cancels anywhere in the editor, also on the buttons of a conflict.
  const onEditorKeyDown = (event: KeyboardEvent) => {
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (event.key === 'Escape' && plain && !event.isComposing) {
      handled(event);
      edits.cancel();
    }
  };
  // Leaving the editor saves it, e.g. with a click elsewhere. It does not when the focus is still in an editor:
  // this one, when VS Code took the focus from the page (the field gets it back later), or the one that took its
  // place, when the list replaced the table. An editor that went (its row left the view) saves nothing. A click moves
  // the focus when its button goes down, and saving closes the editor, which makes its row smaller: it waits for the
  // button to come up, so that the cells below stay under the pointer and the click lands where it was aimed.
  const onFocusOut = (event: FocusEvent) => {
    if (container.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }
    whenPointerUp(() =>
      setTimeout(() => {
        const open = edits.open.peek();
        const same = open?.entryId === editor.entryId && open.locale === editor.locale;
        if (container.current && same && !document.activeElement?.closest(`.${EDITOR_CLASS}`)) {
          edits.commit();
        }
      }, 0),
    );
  };
  const resolve = (resolution: 'takeTheirs' | 'keepMine') => {
    edits[resolution]();
    field.current?.focus();
  };

  const describedBy = [
    editor.conflict && CONFLICT_ID,
    editor.error !== undefined && ERROR_ID,
    CHECK_ID,
    HINT_ID,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    // It takes the focus of a click on its notes, which is no reason to save.
    <div
      ref={container}
      class={EDITOR_CLASS}
      tabIndex={-1}
      data-vscode-context={EDITOR_CONTEXT}
      onKeyDown={onEditorKeyDown}
      onFocusOut={onFocusOut}
    >
      <textarea
        ref={field}
        class="cell-input"
        rows={1}
        value={text}
        lang={locale.lang}
        dir="auto"
        aria-label={l10n.t('{key} in {locale}', { key: keyText, locale: localeName(locale) })}
        aria-describedby={describedBy}
        onInput={(event) => {
          edits.draft.value = event.currentTarget.value;
        }}
        onKeyDown={onFieldKeyDown}
      />
      {editor.conflict && (
        <div class="editor-conflict">
          <p id={CONFLICT_ID} class="editor-note">
            <span aria-hidden="true" class="status-symbol warning">
              {SEVERITY_SYMBOLS.warning}
            </span>{' '}
            {editor.conflict.text === undefined ? (
              l10n.t('Deleted outside the editor.')
            ) : (
              <>
                {l10n.t('Changed outside the editor:')}{' '}
                <span lang={locale.lang} dir="auto">
                  {editor.conflict.text}
                </span>
              </>
            )}
          </p>
          <div role="group" aria-labelledby={CONFLICT_ID} class="editor-choice">
            <button ref={choice} type="button" onClick={() => resolve('takeTheirs')}>
              {l10n.t('Take the New Text')}
            </button>
            <button type="button" onClick={() => resolve('keepMine')}>
              {l10n.t('Keep My Text')}
            </button>
          </div>
        </div>
      )}
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
            {line.severity !== 'ok' && <span class="visually-hidden">{severityWord(line.severity)}: </span>}
            {line.text}
          </p>
        ))}
      </div>
      <p id={HINT_ID} class="editor-note editor-hint">
        {editor.conflict
          ? l10n.t('Tab leads to the choice between the new text and yours; Esc discards yours.')
          : editor.multiline
            ? l10n.t('Ctrl+Enter saves · Tab: save and go on · Esc: cancel')
            : l10n.t('Enter saves · Shift+Enter: new line · Tab: save and go on · Esc: cancel')}
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
