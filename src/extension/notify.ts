import * as vscode from 'vscode';
import { messageOf } from './services/errors';
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

/**
 * Shows the failure of work nobody waits for, e.g. a command that a button of a message started: without it, the
 * rejection went unhandled and the user saw nothing (audit API-03).
 */
export function showFailure(error: unknown): void {
  void showError(messageOf(error));
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
