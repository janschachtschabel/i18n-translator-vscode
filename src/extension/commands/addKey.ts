import * as vscode from 'vscode';
import { editProblem } from '../../core/edit/editMessages';
import { checkNewKey } from '../../core/edit/keyCheck';
import { planEdit } from '../../core/edit/planEdit';
import { ADAPTERS } from '../../core/formats/registry';
import { parseKeyInput } from '../../core/model/keyInput';
import { displayKey } from '../../core/model/keys';
import { localize } from '../localize';
import { inBundle } from '../panels/findBundle';
import { writeChange, type BundleTarget, type KeyCommandContext } from './commandTarget';
import { keyCheckMessage } from './keyQuestions';
import { showError } from '../notify';

/**
 * Adds a key with its text in the reference language, after the key it starts from (e.g. the active one of an
 * editor); the other languages fall back until they are translated. A top-level key that another bundle of the
 * root has too replaces the other one at runtime (shallow merge), so the user confirms such a key.
 */
export async function addKey(
  context: KeyCommandContext,
  { root, bundle }: BundleTarget,
  after?: string,
): Promise<void> {
  const reference = bundle.reference;
  if (reference === undefined) {
    void showError(localize(editProblem('no-reference', { bundle: bundle.name }).message));
    return;
  }
  const flat = ADAPTERS[root.analysis.area.format].flatKeys;
  const parse = (text: string) => parseKeyInput(text.trim(), flat);
  const check = (text: string) => checkNewKey(parse(text), bundle, root.analysis.bundles, root.analysis.area);
  const title = vscode.l10n.t('Add Key to {bundle}', { bundle: bundle.name });
  const typed = await context.prompts.input({
    title,
    prompt: flat
      ? vscode.l10n.t('The new key as it stands in the file, e.g. section_title.')
      : vscode.l10n.t(
          'The new key, with a dot between its parts, e.g. SECTION.TITLE. A dot inside a part is written \\.',
        ),
    placeHolder: flat ? 'section_title' : 'SECTION.TITLE',
    check: (text) => keyCheckMessage(parse(text), check(text)),
  });
  if (typed === undefined) {
    return;
  }
  const key = parse(typed);
  const { problem, warnings } = check(typed);
  if (problem) {
    void showError(localize(problem.message));
    return;
  }
  for (const warning of warnings) {
    if (!(await context.prompts.confirm(localize(warning.message), vscode.l10n.t('Add Key')))) {
      return;
    }
  }
  const required = editProblem('reference-required', { key: displayKey(key), locale: reference });
  const text = await context.prompts.input({
    title,
    prompt: vscode.l10n.t(
      'The text of {key} in the reference language {locale}. The other languages show it until they are translated.',
      { key: displayKey(key), locale: reference },
    ),
    check: (value) => (value === '' ? { message: localize(required.message) } : undefined),
  });
  if (text === undefined) {
    return;
  }
  await writeChange(
    context,
    root,
    inBundle(bundle.id, (current) =>
      planEdit(current, { kind: 'addKey', key, values: { [reference]: text }, ...(after ? { after } : {}) }),
    ),
  );
}
