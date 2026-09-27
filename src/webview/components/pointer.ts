/**
 * Whether a button of a pointer is down on the page. A press moves the focus before the click it may become: what
 * the focus leaving does can wait for the button to come up (see the cell editor).
 */
let tracking = false;
/** The pointers with a button down (several with touch). */
const pressed = new Set<number>();
let waiting: (() => void)[] = [];

function up(pointerId: number): void {
  pressed.delete(pointerId);
  if (pressed.size === 0) {
    release();
  }
}

function release(): void {
  pressed.clear();
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
  window.addEventListener('pointerdown', (event) => pressed.add(event.pointerId), true);
  window.addEventListener('pointerup', (event) => up(event.pointerId), true);
  window.addEventListener('pointercancel', (event) => up(event.pointerId), true);
  // The page missed a button coming up (e.g. a native menu took the pointer): a move with none down tells.
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.buttons === 0 && pressed.size > 0) {
        release();
      }
    },
    true,
  );
  // The button may come up outside the webview, which then gets no pointerup.
  window.addEventListener('blur', release);
}

/** Runs `callback` once no button is down: at once, or when the last pressed one comes up. */
export function whenPointerUp(callback: () => void): void {
  if (pressed.size > 0) {
    waiting.push(callback);
  } else {
    callback();
  }
}
