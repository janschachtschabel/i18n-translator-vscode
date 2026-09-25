import type { Severity } from '../../../core/checks/types';
import { l10n } from '../../l10n';

/** Shown in front of the word of a finding; the word carries the meaning, the symbol and its color help scanning. */
export const SEVERITY_SYMBOLS: Readonly<Record<Severity, string>> = { error: '✖', warning: '⚠', info: 'ℹ' };

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
    case 'duplicate-key':
      return l10n.t('duplicate');
    case 'non-string-value':
      return l10n.t('not a text');
    default:
      return l10n.t('finding');
  }
}
