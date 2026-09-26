/**
 * Whether a button of a pointer is down on the page. A press moves the focus before the click it may become: what
 * the focus leaving does can wait for the button to come up (see the cell editor).
 */
let tracking = false;
let pressed = false;
let waiting: (() => void)[] = [];

function release(): void {
  pressed = false;
  const callbacks = waiting;
  waiting = [];
  callbacks.forEach((callback) => callback());
}

/** Starts following the buttons, once for the page; before, every press counts as released. */
export function trackPointer(): void {
  if (tracking) {
    return;
  }
  tracking = true;
  window.addEventListener('pointerdown', () => (pressed = true), true);
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  // The button may come up outside the webview, which then gets no pointerup.
  window.addEventListener('blur', release);
}

/** Runs `callback` once no button is down: at once, or when the pressed one comes up. */
export function whenPointerUp(callback: () => void): void {
  if (pressed) {
    waiting.push(callback);
  } else {
    callback();
  }
}
