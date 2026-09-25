import { asTag, compareTags, tagSignature } from '../../core/checks/html';
import { asPlaceholder, compareParams, scanPlaceholders } from '../../core/checks/placeholders';
import type { Severity } from '../../core/checks/types';
import { l10n } from '../l10n';

/** A line of the check under the editor; `ok`: placeholders and tags are as in the reference. */
export interface CheckLine {
  severity: Severity | 'ok';
  text: string;
}

/**
 * What the editor says while typing: the placeholders and HTML tags the text lacks or has beyond the reference,
 * as the checks will find them, weighed as their rules are by default (placeholders error, tags warning). Once
 * they match, it says so, if the reference has any. A cleared text is deleted, so the reference applies.
 */
export function inlineCheck(reference: string | undefined, text: string): CheckLine[] {
  if (reference === undefined || reference === '' || text === '') {
    return [];
  }
  const referenceScan = scanPlaceholders(reference);
  const params = compareParams(referenceScan, scanPlaceholders(text));
  const tags = compareTags(reference, text);
  const lines: CheckLine[] = [];
  if (params.missing.length > 0) {
    const names = params.missing.map(asPlaceholder);
    lines.push({ severity: 'error', text: l10n.t('Missing placeholders: {names}', { names }) });
  }
  if (params.extra.length > 0) {
    const names = params.extra.map(asPlaceholder);
    lines.push({
      severity: 'error',
      text: l10n.t('Placeholders the reference does not have: {names}', { names }),
    });
  }
  if (tags.missing.length > 0) {
    const names = tags.missing.map(asTag);
    lines.push({ severity: 'warning', text: l10n.t('Missing HTML tags: {names}', { names }) });
  }
  if (tags.extra.length > 0) {
    const names = tags.extra.map(asTag);
    lines.push({
      severity: 'warning',
      text: l10n.t('HTML tags the reference does not have: {names}', { names }),
    });
  }
  if (lines.length === 0 && (referenceScan.params.length > 0 || tagSignature(reference).length > 0)) {
    lines.push({ severity: 'ok', text: l10n.t('Placeholders and HTML tags as in the reference.') });
  }
  return lines;
}
