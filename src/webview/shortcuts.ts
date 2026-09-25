import { useEffect } from 'preact/hooks';
import { SEARCH_FIELD_ID } from './components/filterBar';
import type { EditorStore } from './state/store';

/**
 * Keys of the whole editor (design §7.2): Ctrl+F (Cmd+F) goes to the search, Alt+M shows the keys with missing
 * texts or all again, Ctrl+Z (Cmd+Z) outside text fields undoes the last change to the files.
 *
 * The listener runs in the capture phase and stops what it handles: VS Code's webview host listens on the same
 * window in the bubble phase and would pass Ctrl+Z on to its own undo, which takes back the typing in the
 * search field even when it does not have the focus.
 */
export function useShortcuts(store: EditorStore): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isCommand(event, 'f')) {
        handled(event);
        const field = document.getElementById(SEARCH_FIELD_ID);
        if (field instanceof HTMLInputElement) {
          field.focus();
          field.select();
        }
      } else if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'm') {
        handled(event);
        store.toggleMissing();
      } else if (isCommand(event, 'z') && !isTextField(event.target)) {
        handled(event);
        store.undo();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [store]);
}

function handled(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Ctrl (Cmd on macOS) with `key` and nothing else. With a layout whose letters are not Latin (Cyrillic, Greek),
 * `key` is another letter, so the physical key decides. Alt+M keeps to `key`: Option+M types "µ" on macOS.
 */
function isCommand(event: KeyboardEvent, key: string): boolean {
  const latin = /^[a-z]$/i.test(event.key);
  const pressed = latin ? event.key.toLowerCase() === key : event.code === `Key${key.toUpperCase()}`;
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && pressed;
}

/** In a text field, Ctrl+Z undoes the typing. */
function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
  }
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}
