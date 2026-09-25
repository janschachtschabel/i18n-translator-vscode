import { useEffect } from 'preact/hooks';
import { SEARCH_FIELD_ID } from './components/filterBar';
import type { EditorStore } from './state/store';

/**
 * Keys of the whole editor (design §7.2): Ctrl+F (Cmd+F) goes to the search, Alt+M shows the keys with missing
 * texts or all again, Ctrl+Z (Cmd+Z) outside text fields undoes the last change to the files.
 */
export function useShortcuts(store: EditorStore): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isCommand(event, 'f')) {
        event.preventDefault();
        const field = document.getElementById(SEARCH_FIELD_ID);
        if (field instanceof HTMLInputElement) {
          field.focus();
          field.select();
        }
      } else if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        store.toggleMissing();
      } else if (isCommand(event, 'z') && !isTextField(event.target)) {
        event.preventDefault();
        store.undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store]);
}

/** Ctrl (Cmd on macOS) with `key` and nothing else. */
function isCommand(event: KeyboardEvent, key: string): boolean {
  return (
    (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === key
  );
}

/** In a text field, Ctrl+Z undoes the typing. */
function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
  }
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}
