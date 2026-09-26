import * as vscode from 'vscode';
import { planAddLanguage } from '../../core/edit/planEdit';
import { localize } from '../localize';
import type { IndexedRoot } from '../services/workspaceIndex';
import { rootLabel, writeChange, type KeyCommandContext } from './commandTarget';

/**
 * Adds a language to a root: an empty file in every bundle that lacks one, so that the language's texts fall
 * back until they are translated. The code is checked against the area's pattern while it is typed.
 */
export async function addLanguage(context: KeyCommandContext, root: IndexedRoot): Promise<void> {
  const plan = (code: string) => planAddLanguage(root.analysis.bundles, root.analysis.area, code.trim());
  const code = await context.prompts.input({
    title: vscode.l10n.t('Add Language to {root}', { root: rootLabel(root) }),
    prompt: vscode.l10n.t(
      'The language code, e.g. es. Every bundle gets an empty file; until its texts are translated, those of the fallback show.',
    ),
    placeHolder: 'es',
    check: (text) => {
      const result = plan(text);
      return result.ok ? undefined : { message: localize(result.problem.message) };
    },
  });
  if (code !== undefined) {
    await writeChange(context, root, (analysis) =>
      planAddLanguage(analysis.bundles, analysis.area, code.trim()),
    );
  }
}
