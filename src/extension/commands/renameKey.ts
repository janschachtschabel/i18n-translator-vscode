import * as vscode from 'vscode';
import { checkNewKey } from '../../core/edit/keyCheck';
import { planInBundles } from '../../core/edit/planEdit';
import { keyInput, parseKeyInput } from '../../core/model/keyInput';
import { displayKey, keyFromId } from '../../core/model/keys';
import { localize } from '../localize';
import { writeChange, type BundleTarget, type KeyCommandContext } from './commandTarget';
import { keyCheckMessage, keyScope } from './keyScope';

/**
 * Renames a key in all its languages: in this bundle, or in every bundle of the root that has it, as the user
 * chooses. A change of several bundles is backed up first (the file store sees to it).
 */
export async function renameKey(
  context: KeyCommandContext,
  target: BundleTarget,
  entryId: string,
): Promise<void> {
  const { root, bundle } = target;
  const key = keyFromId(entryId);
  const check = (text: string) =>
    checkNewKey(parseKeyInput(text.trim()), bundle, root.analysis.bundles, root.analysis.area);
  const typed = await context.prompts.input({
    title: vscode.l10n.t('Rename {key}', { key: displayKey(key) }),
    prompt: vscode.l10n.t('The new name, with a dot between its parts. A dot inside a part is written \\.'),
    value: keyInput(key),
    check: (text) => (parseKeyInput(text.trim()).id === key.id ? undefined : keyCheckMessage(check(text))),
  });
  if (typed === undefined) {
    return;
  }
  const to = parseKeyInput(typed.trim());
  if (to.id === key.id) {
    return;
  }
  const { problem } = check(typed);
  if (problem) {
    void vscode.window.showErrorMessage(localize(problem.message));
    return;
  }
  const bundles = await keyScope(context, 'rename', target, key);
  if (bundles) {
    await writeChange(context, root, (analysis) =>
      planInBundles(analysis.bundles, bundles, { kind: 'renameKey', entryId, to }),
    );
  }
}
