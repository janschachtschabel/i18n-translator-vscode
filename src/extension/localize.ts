import * as vscode from 'vscode';
import { displayArgs } from '../core/checks/messages';
import type { MessageText } from '../core/report/problems';

/**
 * Localizes a message of the core catalog. Its English template is the key in l10n/bundle.l10n.*.json;
 * a unit test checks that every template of the catalog has a German text. Only pass catalog templates:
 * VS Code logs a warning for every lookup without a translation.
 */
export function localize(message: MessageText): string {
  return vscode.l10n.t(message.template, displayArgs(message.args));
}
