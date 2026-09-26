import * as vscode from 'vscode';
import { askModal } from '../notify';

/** What a check of typed text says: an error keeps it from being accepted, a warning does not. */
export interface InputCheck {
  message: string;
  warning?: boolean;
}

export interface PickItem<T> {
  label: string;
  description?: string;
  value: T;
}

/**
 * The questions the key and language commands ask. Behind an interface, so that the integration tests can
 * answer them: VS Code's input boxes and modal dialogs would wait for a user.
 */
export interface Prompts {
  /** Text the user types, checked while typing; undefined: cancelled. */
  input(options: {
    title: string;
    prompt: string;
    value?: string;
    placeHolder?: string;
    check: (text: string) => InputCheck | undefined;
  }): Promise<string | undefined>;
  /** A modal question with one action; false: cancelled. */
  confirm(message: string, action: string, detail?: string): Promise<boolean>;
  /** A modal question with several actions; undefined: cancelled. */
  choose<T extends string>(message: string, actions: readonly T[], detail?: string): Promise<T | undefined>;
  /** One of several items; undefined: cancelled. */
  pick<T>(items: readonly PickItem<T>[], placeHolder: string): Promise<T | undefined>;
}

/** The questions as VS Code asks them. */
export const vscodePrompts: Prompts = {
  input: ({ title, prompt, value, placeHolder, check }) =>
    Promise.resolve(
      vscode.window.showInputBox({
        title,
        prompt,
        value,
        placeHolder,
        ignoreFocusOut: true,
        validateInput: (text) => {
          const result = check(text);
          return (
            result && {
              message: result.message,
              severity: result.warning
                ? vscode.InputBoxValidationSeverity.Warning
                : vscode.InputBoxValidationSeverity.Error,
            }
          );
        },
      }),
    ),
  confirm: async (message, action, detail) => (await askModal(message, detail, action)) === action,
  choose: async (message, actions, detail) => askModal(message, detail, ...actions),
  pick: async (items, placeHolder) =>
    (await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true }))?.value,
};
