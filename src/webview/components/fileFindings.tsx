import type { BundleViewModel } from '../../shared/viewModel';
import { l10n } from '../l10n';
import { SEVERITY_SYMBOLS, severityWord } from './cellStatus';

/**
 * Findings no cell can show: about a whole file (missing, unreadable) and about keys without a row (an object
 * defined twice, a number). Without this list, the biggest gaps of a bundle would be the least visible.
 */
export function FileFindings({ model }: { model: BundleViewModel }) {
  const issues = [...model.locales.flatMap((locale) => locale.issues), ...model.issues];
  if (issues.length === 0) {
    return null;
  }
  return (
    <ul class="file-findings" aria-label={l10n.t('Other findings')}>
      {issues.map((issue, index) => (
        <li key={index}>
          <span aria-hidden="true" class={`status-symbol ${issue.severity}`}>
            {SEVERITY_SYMBOLS[issue.severity]}
          </span>{' '}
          <span class="visually-hidden">{severityWord(issue.severity)}: </span>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
