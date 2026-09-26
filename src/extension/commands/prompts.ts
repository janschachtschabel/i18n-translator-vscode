import * as vscode from 'vscode';
import { askModal } from '../notify';
import { askInput, type InputOptions } from './inputBox';

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
  input(options: InputOptions): Promise<string | undefined>;
  /** A modal question with one action; false: cancelled. */
  confirm(message: string, action: string, detail?: string): Promise<boolean>;
  /** A modal question with several actions; undefined: cancelled. */
  choose<T extends string>(message: string, actions: readonly T[], detail?: string): Promise<T | undefined>;
  /** One of several items; undefined: cancelled. */
  pick<T>(items: readonly PickItem<T>[], placeHolder: string): Promise<T | undefined>;
}

/** The questions as VS Code asks them. */
export const vscodePrompts: Prompts = {
  input: (options) =>
    askInput(vscode.window.createInputBox(), options, {
      closeButton: { iconPath: new vscode.ThemeIcon('close'), tooltip: vscode.l10n.t('Cancel (Escape)') },
      validation: ({ message, warning }) => ({
        message,
        severity: warning
          ? vscode.InputBoxValidationSeverity.Warning
          : vscode.InputBoxValidationSeverity.Error,
      }),
    }),
  confirm: async (message, action, detail) => (await askModal(message, detail, action)) === action,
  choose: async (message, actions, detail) => askModal(message, detail, ...actions),
  pick: async (items, placeHolder) =>
    (await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true }))?.value,
};
