import type { BundleViewModel } from '../../shared/viewModel';
import { l10n } from '../l10n';
import { StatusNote } from './statusNote';

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
          <StatusNote severity={issue.severity} text={issue.message} />
        </li>
      ))}
    </ul>
  );
}
