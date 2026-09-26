import * as vscode from 'vscode';
import type { Bundle } from '../../core/model/bundle';
import { showInfo } from '../notify';
import type { MailPreview } from '../panels/mailPreview';
import { bundleTarget, type TargetSources } from './commandTarget';
import type { Prompts } from './prompts';

const holdsMails = (bundle: Bundle) => bundle.format === 'mail-xml';

/**
 * Shows the preview of a mail template: of the key whose context menu it was chosen in, else of a template the user
 * picks in the mail templates of the editor in front, or in those the user picks. It only reads, so it also runs in
 * Restricted Mode.
 */
export async function previewMail(arg: unknown, sources: TargetSources, preview: MailPreview): Promise<void> {
  const snapshot = await sources.index.latest();
  if (!snapshot.roots.some((root) => root.analysis.bundles.some(holdsMails))) {
    await showInfo(vscode.l10n.t('No mail templates were found in this workspace.'));
    return;
  }
  const chosen = await bundleTarget(arg, sources, holdsMails);
  if (!chosen) {
    return;
  }
  const { root, bundle } = chosen.target;
  const entryId = chosen.entryId ?? (await pickTemplate(bundle, sources.prompts));
  if (entryId !== undefined) {
    preview.show({ folder: root.folder.uri.toString(), bundleId: bundle.id }, entryId);
  }
}

/** A template of the bundle, named by the first key it has. */
function pickTemplate(bundle: Bundle, prompts: Prompts): Promise<string | undefined> {
  const firstKeys = new Map<string, string>();
  for (const key of bundle.keys) {
    const template = key.segments[0]!;
    if (!firstKeys.has(template)) {
      firstKeys.set(template, key.id);
    }
  }
  return prompts.pick(
    [...firstKeys].map(([template, entryId]) => ({ label: template, value: entryId })),
    vscode.l10n.t('Choose a mail template'),
  );
}
