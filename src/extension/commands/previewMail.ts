import * as vscode from 'vscode';
import type { Bundle } from '../../core/model/bundle';
import { showInfo } from '../notify';
import type { MailPreview } from '../panels/mailPreview';
import { bundleTarget, type TargetSources } from './commandTarget';
import type { Prompts } from './prompts';

/**
 * Shows the preview of a mail template: of the key whose context menu it was chosen in, else of a template the user
 * picks in the bundle of the editor in front, or in a bundle the user picks. It only reads, so it also runs in
 * Restricted Mode.
 */
export async function previewMail(arg: unknown, sources: TargetSources, preview: MailPreview): Promise<void> {
  const chosen = await bundleTarget(arg, sources);
  if (!chosen) {
    return;
  }
  const { root, bundle } = chosen.target;
  if (bundle.format !== 'mail-xml') {
    await showInfo(
      vscode.l10n.t('{bundle} holds no mail templates, so there is no mail to preview.', {
        bundle: bundle.name,
      }),
    );
    return;
  }
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
