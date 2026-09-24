import type { IssueArgs, RuleId } from './types';

/**
 * English message templates; the extension localizes them via vscode.l10n (German in l10n/bundle.l10n.de.json),
 * the CLI prints them as they are. `{name}` refers to an issue argument.
 */
export const ISSUE_MESSAGES: Readonly<Record<RuleId, string>> = {
  'parse-error': 'The file cannot be read: {detail}.',
  'non-string-value': '{key} has a value that is not text.',
  'duplicate-key': '{key} is defined more than once in this file; only the last definition is used.',
  'not-utf8': 'The file is not valid UTF-8.',
  'missing-file': 'The {locale} file of {bundle} is missing.',
  'missing-key': '{key} is missing in {locale}.',
  'empty-value': '{key} is empty in {locale}; the empty text replaces the fallback.',
  'orphan-key': '{key} exists in {locale} but not in the reference {reference}.',
  'misplaced-key': '{key} exists only in {locale}; it probably belongs at {suggestion}.',
  'placeholder-malformed': 'Malformed placeholder syntax "{text}" in {key}.',
  'placeholder-mismatch':
    'The placeholders of {key} differ from the reference {reference}: missing {missing}, extra {extra}.',
  'html-mismatch':
    'The HTML tags of {key} differ from the reference {reference}: missing {missing}, extra {extra}.',
  'variant-needed': 'The {base} text of {key} contains "{match}"; {locale} needs its own text.',
  'variant-inconsistent': 'The {locale} text of {key} still contains "{match}".',
  'variant-orphan': '{key} exists in {locale} but not in {base}.',
  'key-overridden':
    '{key} is also defined in {winner}, which is loaded later: its text replaces this one in the whole app.',
  'subtree-lost':
    '{key} is unreachable at runtime: {winner}, which is loaded later, replaces the top-level key {topKey}.',
  'same-as-reference': '{key} in {locale} is identical to the reference text and may be untranslated.',
};

/** Several missing-key findings of one file, combined into one diagnostic. */
export const MISSING_KEYS_MESSAGE = '{count} keys are missing in {locale}.';

export function formatMessage(template: string, args: IssueArgs): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = args[name];
    if (value === undefined) {
      return placeholder;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    return value.length > 0 ? value.join(', ') : '–';
  });
}
