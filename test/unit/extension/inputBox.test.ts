import type * as vscode from 'vscode';
import { describe, expect, it } from 'vitest';
import { askInput, type InputBoxLike, type InputCheck } from '../../../src/extension/commands/inputBox';

type Listener<T> = (event: T) => unknown;

/** An event of the fake box: `on` subscribes, `fire` calls the listeners. */
function emitter<T>() {
  const listeners: Listener<T>[] = [];
  return {
    on: ((listener: Listener<T>) => {
      listeners.push(listener);
      return { dispose: () => void listeners.splice(listeners.indexOf(listener), 1) };
    }) as vscode.Event<T>,
    fire: (event: T) => listeners.slice().forEach((listener) => listener(event)),
  };
}

/** VS Code's input box as far as askInput uses it; hide() fires onDidHide, as in VS Code. */
class FakeBox implements InputBoxLike {
  title: string | undefined;
  prompt: string | undefined;
  value = '';
  placeholder: string | undefined;
  validationMessage: string | vscode.InputBoxValidationMessage | undefined;
  buttons: readonly vscode.QuickInputButton[] = [];
  ignoreFocusOut = false;
  shown = false;
  disposed = false;
  readonly changed = emitter<string>();
  readonly accepted = emitter<void>();
  readonly hidden = emitter<void>();
  readonly triggered = emitter<vscode.QuickInputButton>();
  onDidChangeValue = this.changed.on;
  onDidAccept = this.accepted.on;
  onDidHide = this.hidden.on;
  onDidTriggerButton = this.triggered.on;
  show() {
    this.shown = true;
  }
  hide() {
    if (this.shown) {
      this.shown = false;
      this.hidden.fire();
    }
  }
  dispose() {
    this.hide();
    this.disposed = true;
  }
  /** What the user types. */
  type(text: string) {
    this.value = text;
    this.changed.fire(text);
  }
}

const closeButton = { iconPath: { id: 'close' }, tooltip: 'Cancel (Escape)' } as vscode.QuickInputButton;
const parts = {
  closeButton,
  validation: ({ message, warning }: InputCheck) => ({ message, severity: warning ? 2 : 3 }),
};
/** No text is an error; "warn" is accepted with a warning. */
const check = (text: string): InputCheck | undefined =>
  text === ''
    ? { message: 'Type a key.' }
    : text === 'warn'
      ? { message: 'Check it.', warning: true }
      : undefined;
const ask = (box: FakeBox, value?: string) =>
  askInput(
    box,
    { title: 'Add Key', prompt: 'The new key', placeHolder: 'SECTION.TITLE', value, check },
    parts,
  );
/** Settles pending promise callbacks, so that a promise that has not settled shows as pending. */
const pending = async (promise: Promise<unknown>) =>
  (await Promise.race([promise.then(() => 'settled'), Promise.resolve().then(() => 'pending')])) ===
  'pending';

describe('askInput', () => {
  it('shows the box with its texts, closing when the focus goes elsewhere', () => {
    const box = new FakeBox();
    void ask(box, 'OLD.KEY');
    expect(box).toMatchObject({
      shown: true,
      title: 'Add Key',
      prompt: 'The new key',
      placeholder: 'SECTION.TITLE',
      value: 'OLD.KEY',
      ignoreFocusOut: false,
    });
  });

  it('gives no text when the box closes without Enter: Escape, a click elsewhere', async () => {
    const box = new FakeBox();
    const answer = ask(box);
    box.type('NEW.KEY');
    box.hide();
    expect(await answer).toBeUndefined();
    expect(box.disposed).toBe(true);
  });

  it('has a button that closes it', async () => {
    const box = new FakeBox();
    const answer = ask(box);
    expect(box.buttons).toEqual([closeButton]);
    box.triggered.fire(closeButton);
    expect(await answer).toBeUndefined();
    expect(box.shown).toBe(false);
  });

  it('checks the text while it is typed, the first one too', () => {
    const box = new FakeBox();
    void ask(box);
    expect(box.validationMessage).toEqual({ message: 'Type a key.', severity: 3 });
    box.type('warn');
    expect(box.validationMessage).toEqual({ message: 'Check it.', severity: 2 });
    box.type('NEW.KEY');
    expect(box.validationMessage).toBeUndefined();
  });

  it('keeps a text with an error from being accepted, but accepts one with a warning', async () => {
    const box = new FakeBox();
    const answer = ask(box);
    box.accepted.fire();
    expect(await pending(answer)).toBe(true);
    expect(box.shown).toBe(true);
    box.type('warn');
    box.accepted.fire();
    expect(await answer).toBe('warn');
    expect(box.disposed).toBe(true);
  });
});
