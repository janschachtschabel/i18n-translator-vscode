import type { Severity } from '../../core/checks/types';
import { l10n } from '../l10n';
import type { ShownCell } from '../state/shownRows';

/** Shown in front of the word of a finding; the word carries the meaning, the symbol and its color help scanning. */
export const SEVERITY_SYMBOLS: Readonly<Record<Severity, string>> = { error: '✖', warning: '⚠', info: 'ℹ' };

/**
 * How a text is marked: by its most severe finding, "not saved" counting as an error. Hints mark nothing: they are
 * guesses (e.g. "as reference"), and marking them would drown the gaps and errors.
 */
export function cellMark(cell: Pick<ShownCell, 'issues' | 'notSaved'>): 'error' | 'warning' | undefined {
  if (cell.notSaved !== undefined || cell.issues.some((issue) => issue.severity === 'error')) {
    return 'error';
  }
  return cell.issues.some((issue) => issue.severity === 'warning') ? 'warning' : undefined;
}

/** A word for what a finding in a cell is about; its full message describes the cell. */
export function statusWord(rule: string): string {
  switch (rule) {
    case 'missing-key':
      return l10n.t('missing');
    case 'empty-value':
      return l10n.t('empty');
    case 'placeholder-malformed':
    case 'placeholder-mismatch':
      return l10n.t('placeholders');
    case 'html-mismatch':
      return l10n.t('HTML');
    case 'variant-needed':
      return l10n.t('variant needed');
    case 'variant-inconsistent':
      return l10n.t('check variant');
    case 'variant-orphan':
      return l10n.t('not in the base');
    case 'orphan-key':
      return l10n.t('not in the reference');
    case 'misplaced-key':
      return l10n.t('misplaced');
    case 'key-overridden':
      return l10n.t('overridden');
    case 'subtree-lost':
      return l10n.t('lost');
    case 'same-as-reference':
      return l10n.t('as reference');
    case 'lost-character':
      return l10n.t('character lost');
    case 'duplicate-key':
      return l10n.t('duplicate');
    case 'bom-first-key':
      return l10n.t('never read');
    case 'non-string-value':
      return l10n.t('not a text');
    default:
      return l10n.t('finding');
  }
}

/** The severity in words, for screen readers: the symbol that shows it is hidden from them. */
export function severityWord(severity: Severity): string {
  switch (severity) {
    case 'error':
      return l10n.t('Error');
    case 'warning':
      return l10n.t('Warning');
    case 'info':
      return l10n.t('Info');
  }
}
