import { formatMessage } from '../core/checks/messages';
import type { IssueArgs } from '../core/checks/types';

let translations: Readonly<Record<string, string>> = {};

/** Takes the translations the host sends with `init`; texts without one stay English. */
export function setTranslations(bundle: Readonly<Record<string, string>>): void {
  translations = bundle;
}

/**
 * Texts of the editor in the language of VS Code. Called like `vscode.l10n.t`, so the l10n test collects the
 * English texts of the webview with those of the host and checks that each has a German translation.
 */
export const l10n = {
  t(message: string, args: IssueArgs = {}): string {
    return formatMessage(Object.hasOwn(translations, message) ? translations[message]! : message, args);
  },
};
