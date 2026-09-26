import * as vscode from 'vscode';
import { parseBundleId } from '../../core/model/bundle';
import type { PanelState } from '../../shared/protocol';
import type { Prompts } from '../commands/prompts';
import { undoLastChange } from '../commands/undoLastChange';
import type { FileStore } from '../services/fileStore';
import { relative } from '../services/files';
import type { WorkspaceIndex } from '../services/workspaceIndex';
import { findBundle } from './findBundle';

/**
 * Undoes the last change of the session from the editor of `target`, and tells the user how it went. A change
 * of other files than the bundle's is not on screen, so the user confirms it first.
 */
export function undoFromEditor(
  target: PanelState,
  services: { index: WorkspaceIndex; fileStore: FileStore; prompts: Prompts },
): Promise<void> {
  return undoLastChange(services.fileStore, async (files) => {
    const found = findBundle(await services.index.latest(), target);
    const own = new Set(
      found?.bundle.locales.map((locale) =>
        vscode.Uri.joinPath(
          found.root.folder.uri,
          ...found.bundle.file(locale)!.relPath.split('/'),
        ).toString(),
      ),
    );
    if (files.every((file) => own.has(file.toString()))) {
      return true;
    }
    const question = vscode.l10n.t('The last change was not made in {bundle} but in {files}. Undo it?', {
      bundle: parseBundleId(target.bundleId).name,
      files: files.map(relative).join(', '),
    });
    return services.prompts.confirm(question, vscode.l10n.t('Undo Change'));
  });
}
