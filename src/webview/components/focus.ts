/** The focus went with the element that had it: on the page, nothing has it. */
export function focusIsLost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}

/**
 * Follows the focus leaving `container`: `left` runs when it went elsewhere on the page, with a click beside the
 * controls included. It does not run when the element that had it went away (its row, its card): then the focus
 * is lost and comes back. Without a new target, only a disconnected element tells the two apart.
 */
export function onFocusLeaving(event: FocusEvent, container: Element | null, left: () => void): void {
  const target = event.relatedTarget as Node | null;
  if (target !== null) {
    if (!container?.contains(target)) {
      left();
    }
    return;
  }
  const element = event.target as Element;
  queueMicrotask(() => {
    if (element.isConnected) {
      left();
    }
  });
}
