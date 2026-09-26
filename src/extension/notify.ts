import * as vscode from 'vscode';
import { plainNotice } from './views/viewText';

// The only way the extension shows notifications and message dialogs (a lint rule enforces it): their texts carry
// names from the workspace, which must never turn into links that run commands.

export function showInfo<T extends string>(message: string, ...actions: T[]): Thenable<T | undefined> {
  return vscode.window.showInformationMessage(plainNotice(message), ...actions);
}

export function showWarning<T extends string>(message: string, ...actions: T[]): Thenable<T | undefined> {
  return vscode.window.showWarningMessage(plainNotice(message), ...actions);
}

export function showError<T extends string>(message: string, ...actions: T[]): Thenable<T | undefined> {
  return vscode.window.showErrorMessage(plainNotice(message), ...actions);
}

/** A modal question with its actions; undefined when the user closes it. */
export function askModal<T extends string>(
  message: string,
  detail: string | undefined,
  ...actions: T[]
): Thenable<T | undefined> {
  return vscode.window.showWarningMessage(
    plainNotice(message),
    { modal: true, ...(detail !== undefined ? { detail: plainNotice(detail) } : {}) },
    ...actions,
  );
}
