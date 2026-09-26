import type { IssueArgs, RuleId } from './types';

/** An English message template with `{name}` arguments; the host localizes and fills it. */
export interface MessageText {
  template: string;
  args: IssueArgs;
}

/** English message templates, shared by the CLI and the extension. `{name}` refers to an issue argument. */
export const ISSUE_MESSAGES: Readonly<Record<RuleId, string>> = {
  'parse-error': 'The file cannot be read: {detail}.',
  'non-string-value': '{key} has a value that is not text.',
  'duplicate-key': '{key} is defined more than once in this file; only one of the definitions counts.',
  'bom-first-key':
    '{key} is never read: the file begins with a byte order mark, which Java reads as part of its first key.',
  'not-utf8': 'The file is not valid UTF-8.',
  'missing-file': 'The {locale} file of {bundle} is missing.',
  'missing-key': '{key} is missing in {locale}.',
  'empty-value': '{key} is empty in {locale}; the empty text replaces the fallback.',
  'orphan-key': '{key} exists in {locale} but not in the reference {reference}.',
  'misplaced-key': '{key} in {locale} is not in the reference; it probably belongs at {suggestion}.',
  'placeholder-malformed': 'Malformed placeholder syntax "{text}" in {key}.',
  'placeholder-mismatch':
    'The placeholders of {key} differ from the reference {reference}: missing {missing}, extra {extra}.',
  'html-mismatch':
    'The HTML tags of {key} differ from the reference {reference}: missing {missing}, extra {extra}.',
  'variant-needed': 'The {base} text of {key} contains "{match}"; {locale} needs its own text.',
  'variant-inconsistent': 'The {locale} text of {key} still contains "{match}".',
  'variant-orphan': '{key} exists in {locale} but not in {base}.',
  'key-overridden':
    '{key} is also defined in {winner}, which comes later in the merge order: its {locale} text replaces this one.',
  'subtree-lost':
    '{key} is unreachable in {locale}: {winner}, which comes later in the merge order, replaces the whole top-level key {topKey}.',
  'same-as-reference': '{key} in {locale} is identical to the reference text and may be untranslated.',
  'lost-character':
    '{key} in {locale} has a question mark between letters or a replacement character: probably a character lost when the file was saved in another encoding.',
};

/** Several missing-key findings of one file, combined into one diagnostic (always two or more keys). */
export const MISSING_KEYS_MESSAGE = '{count} keys are missing in {locale}.';

/** Arguments as messages show them: lists joined with commas, an empty list as "–". */
export function displayArgs(args: IssueArgs): Record<string, string> {
  return Object.fromEntries(
    Object.entries(args).map(([name, value]) => [
      name,
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : value.length > 0
          ? value.join(', ')
          : '–',
    ]),
  );
}

export function formatMessage(template: string, args: IssueArgs): string {
  const values = displayArgs(args);
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}
