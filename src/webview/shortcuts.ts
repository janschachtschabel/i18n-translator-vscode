import { useEffect } from 'preact/hooks';
import type { EditorStore } from './state/store';

/** Keys of the whole editor: Ctrl+Z (Cmd+Z) outside text fields undoes the last change to the files. */
export function useShortcuts(store: EditorStore): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isUndo(event) && !isTextField(event.target)) {
        event.preventDefault();
        store.undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store]);
}

function isUndo(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z'
  );
}

/** In a text field, Ctrl+Z undoes the typing. */
function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
  }
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}
