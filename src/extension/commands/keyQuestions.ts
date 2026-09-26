import * as vscode from 'vscode';
import type { KeyCheck } from '../../core/edit/keyCheck';
import { displayKey, type EntryKey } from '../../core/model/keys';
import { localize } from '../localize';
import type { BundleTarget, KeyCommandContext } from './commandTarget';
import type { InputCheck } from './prompts';

/**
 * The bundles a rename or a delete changes. When other bundles of the root have the key too, the user chooses:
 * only this bundle, or all of them (they are named). A delete in one bundle is confirmed. Undefined: cancelled.
 */
export async function keyScope(
  context: KeyCommandContext,
  action: 'rename' | 'delete',
  { root, bundle }: BundleTarget,
  key: EntryKey,
): Promise<string[] | undefined> {
  const others = root.analysis.bundles.filter(
    (other) => other.id !== bundle.id && other.keys.some((candidate) => candidate.id === key.id),
  );
  const args = { key: displayKey(key), bundle: bundle.name };
  if (others.length === 0) {
    if (action === 'rename') {
      return [bundle.id];
    }
    const question = vscode.l10n.t('Delete {key} in {bundle}, in all its languages?', args);
    return (await context.prompts.confirm(question, vscode.l10n.t('Delete Key'))) ? [bundle.id] : undefined;
  }
  const only = vscode.l10n.t('Only in This Bundle');
  const all = vscode.l10n.t('In All Bundles with This Key ({count})', { count: String(others.length + 1) });
  const question =
    action === 'rename'
      ? vscode.l10n.t('Rename {key} only in {bundle}, or in every bundle that has it?', args)
      : vscode.l10n.t(
          'Delete {key} only in {bundle}, or in every bundle that has it? It goes in all languages.',
          args,
        );
  const detail = vscode.l10n.t('Bundles with this key: {bundles}', {
    bundles: [bundle, ...others].map((candidate) => candidate.name).join(', '),
  });
  const answer = await context.prompts.choose(question, [only, all], detail);
  if (answer === undefined) {
    return undefined;
  }
  return answer === only ? [bundle.id] : [bundle.id, ...others.map((other) => other.id)];
}

/**
 * What the check of a typed key says: a problem refuses it, a warning only informs, e.g. of a part that starts or
 * ends with a space, which is likely a typo (`SECTION. TITLE`).
 */
export function keyCheckMessage(key: EntryKey, { problem, warnings }: KeyCheck): InputCheck | undefined {
  if (problem) {
    return { message: localize(problem.message) };
  }
  if (key.segments.some((segment) => segment !== segment.trim())) {
    return { message: vscode.l10n.t('A part of the key starts or ends with a space.'), warning: true };
  }
  const [warning] = warnings;
  return warning && { message: localize(warning.message), warning: true };
}
