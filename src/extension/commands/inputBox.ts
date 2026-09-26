import type * as vscode from 'vscode';

/** What a check of typed text says: an error keeps it from being accepted, a warning does not. */
export interface InputCheck {
  message: string;
  warning?: boolean;
}

export interface InputOptions {
  title: string;
  prompt: string;
  value?: string;
  placeHolder?: string;
  check: (text: string) => InputCheck | undefined;
  /** Masks the text, e.g. a key. */
  password?: boolean;
  /** Keeps the box open when the focus goes elsewhere, e.g. to a password manager to copy a key from. */
  ignoreFocusOut?: boolean;
}

/** The parts of VS Code's input box that askInput uses; the unit tests give a fake one. */
export type InputBoxLike = Pick<
  vscode.InputBox,
  | 'title'
  | 'prompt'
  | 'value'
  | 'placeholder'
  | 'validationMessage'
  | 'buttons'
  | 'ignoreFocusOut'
  | 'password'
  | 'onDidChangeValue'
  | 'onDidAccept'
  | 'onDidHide'
  | 'onDidTriggerButton'
  | 'show'
  | 'hide'
  | 'dispose'
>;

export interface InputBoxParts {
  /** A button in the title bar that closes the box, as Escape and a click elsewhere do. */
  closeButton: vscode.QuickInputButton;
  /** How a check shows below the field. */
  validation: (check: InputCheck) => vscode.InputBoxValidationMessage;
}

/**
 * Asks for text in `box`, checked while it is typed; undefined when the box closes without an accepted text.
 * Unlike showInputBox, the box has a close button: users who open it with a click look for one.
 */
export function askInput(
  box: InputBoxLike,
  options: InputOptions,
  parts: InputBoxParts,
): Promise<string | undefined> {
  const validate = (text: string) => {
    const result = options.check(text);
    box.validationMessage = result && parts.validation(result);
    return result;
  };
  return new Promise((resolve) => {
    let answer: string | undefined;
    box.title = options.title;
    box.prompt = options.prompt;
    box.placeholder = options.placeHolder;
    box.value = options.value ?? '';
    box.buttons = [parts.closeButton];
    box.password = options.password ?? false;
    box.ignoreFocusOut = options.ignoreFocusOut ?? false;
    validate(box.value);
    box.onDidChangeValue(validate);
    box.onDidTriggerButton((button) => {
      if (button === parts.closeButton) {
        box.hide();
      }
    });
    box.onDidAccept(() => {
      const result = validate(box.value);
      if (result && !result.warning) {
        return;
      }
      answer = box.value;
      box.hide();
    });
    box.onDidHide(() => {
      box.dispose();
      resolve(answer);
    });
    box.show();
  });
}
