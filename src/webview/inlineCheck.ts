import type { PlaceholderSyntax } from '../core/area/areaDefinition';
import { asTag, compareTags, tagSignature } from '../core/checks/html';
import {
  asCondition,
  asPlaceholder,
  compareConditions,
  compareParams,
  scanPlaceholders,
} from '../core/checks/placeholders';
import type { Severity } from '../core/checks/types';
import { l10n } from './l10n';

/** A line of the check under the editor; `ok`: placeholders and tags are as in the reference. */
export interface CheckLine {
  severity: Severity | 'ok';
  text: string;
}

/**
 * What the editor says while typing: the placeholders, conditions of mail texts and HTML tags the text lacks or has
 * beyond the reference, and conditions without their pair, as the checks will find them, weighed as their rules are
 * by default (placeholders and conditions error, tags warning). Once they match, it says so, if the reference has
 * any. A cleared text is deleted, so the reference applies; as in the checks, a text of only white space counts as
 * none.
 */
export function inlineCheck(
  reference: string | undefined,
  text: string,
  syntax: PlaceholderSyntax = 'double-brace',
): CheckLine[] {
  if (!reference?.trim() || !text.trim()) {
    return [];
  }
  const referenceScan = scanPlaceholders(reference, syntax);
  const textScan = scanPlaceholders(text, syntax);
  const params = compareParams(referenceScan, textScan);
  // Areas with single braces have no conditions.
  const conditions = syntax !== 'single-brace' ? compareConditions(referenceScan, textScan) : undefined;
  const asName = (name: string) => asPlaceholder(name, syntax);
  const tags = compareTags(reference, text);
  const lines: CheckLine[] = [];
  if (params.missing.length > 0) {
    const names = params.missing.map(asName);
    lines.push({ severity: 'error', text: l10n.t('Missing placeholders: {names}', { names }) });
  }
  if (params.extra.length > 0) {
    const names = params.extra.map(asName);
    lines.push({
      severity: 'error',
      text: l10n.t('Placeholders the reference does not have: {names}', { names }),
    });
  }
  if (conditions && conditions.missing.length > 0) {
    const names = conditions.missing.map(asCondition);
    lines.push({ severity: 'error', text: l10n.t('Missing conditions: {names}', { names }) });
  }
  if (conditions && conditions.extra.length > 0) {
    const names = conditions.extra.map(asCondition);
    lines.push({
      severity: 'error',
      text: l10n.t('Conditions the reference does not have: {names}', { names }),
    });
  }
  if (conditions && textScan.unpaired.length > 0) {
    lines.push({
      severity: 'error',
      text: l10n.t('Conditions without their pair: {names}', { names: textScan.unpaired }),
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
  const hasAny =
    referenceScan.params.length > 0 ||
    (conditions !== undefined && referenceScan.conditions.length > 0) ||
    tagSignature(reference).length > 0;
  if (lines.length === 0 && hasAny) {
    lines.push({ severity: 'ok', text: l10n.t('Placeholders and HTML tags as in the reference.') });
  }
  return lines;
}
