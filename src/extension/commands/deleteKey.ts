import { planInBundles } from '../../core/edit/planEdit';
import { keyFromId } from '../../core/model/keys';
import { writeChange, type BundleTarget, type KeyCommandContext } from './commandTarget';
import { keyScope } from './keyScope';

/**
 * Deletes a key in all its languages: in this bundle, or in every bundle of the root that has it, as the user
 * chooses; either way only after a modal question. Undo brings it back.
 */
export async function deleteKey(
  context: KeyCommandContext,
  target: BundleTarget,
  entryId: string,
): Promise<void> {
  const bundles = await keyScope(context, 'delete', target, keyFromId(entryId));
  if (bundles) {
    await writeChange(context, target.root, (analysis) =>
      planInBundles(analysis.bundles, bundles, { kind: 'deleteKey', entryId }),
    );
  }
}
