import * as vscode from 'vscode';
import type { EditorCommand, PanelState } from '../../shared/protocol';
import { findBundle } from '../panels/findBundle';
import { showWriteFailure } from '../services/writeFeedback';
import { addKey } from './addKey';
import { addLanguage } from './addLanguage';
import {
  bundleTarget,
  pickBundle,
  rootTarget,
  type KeyCommandContext,
  type TargetSources,
} from './commandTarget';
import { deleteKey } from './deleteKey';
import { renameKey } from './renameKey';

/**
 * The key and language commands for the menus and the palette, and "Open translation editor…", which asks for
 * the bundle. Rename and delete need a key: the areas view has none, so they come from an editor.
 */
export function registerKeyCommands(sources: TargetSources): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('eduI18n.addKey', async (arg?: unknown) => {
      if (refusedUntrusted(sources)) {
        return;
      }
      const found = await bundleTarget(arg, sources);
      if (found) {
        await addKey(sources, found.target, found.entryId);
      }
    }),
    vscode.commands.registerCommand('eduI18n.renameKey', async (arg?: unknown) => {
      if (refusedUntrusted(sources)) {
        return;
      }
      const found = await bundleTarget(arg, sources);
      if (found?.entryId !== undefined) {
        await renameKey(sources, found.target, found.entryId);
      }
    }),
    vscode.commands.registerCommand('eduI18n.deleteKey', async (arg?: unknown) => {
      if (refusedUntrusted(sources)) {
        return;
      }
      const found = await bundleTarget(arg, sources);
      if (found?.entryId !== undefined) {
        await deleteKey(sources, found.target, found.entryId);
      }
    }),
    vscode.commands.registerCommand('eduI18n.addLanguage', async (arg?: unknown) => {
      if (refusedUntrusted(sources)) {
        return;
      }
      const root = await rootTarget(arg, sources);
      if (root) {
        await addLanguage(sources, root);
      }
    }),
    vscode.commands.registerCommand('eduI18n.openEditor', async () => {
      const picked = await pickBundle(await sources.index.latest(), sources.prompts);
      if (picked) {
        sources.editors.open(picked.root, picked.bundle);
      }
    }),
  ];
}

/**
 * Runs a command an editor asked for, on its bundle as the index has it now. The key it starts from comes from
 * the webview: a key the bundle does not have counts as none.
 */
export async function runEditorCommand(
  context: KeyCommandContext,
  command: EditorCommand,
  panel: PanelState,
  entryId: string | undefined,
): Promise<void> {
  if (refusedUntrusted(context)) {
    return;
  }
  const target = findBundle(await context.index.latest(), panel);
  if (!target) {
    return;
  }
  const key = target.bundle.keys.some((candidate) => candidate.id === entryId) ? entryId : undefined;
  switch (command) {
    case 'addKey':
      return addKey(context, target, key);
    case 'renameKey':
      return key === undefined ? undefined : renameKey(context, target, key);
    case 'deleteKey':
      return key === undefined ? undefined : deleteKey(context, target, key);
    case 'addLanguage':
      return addLanguage(context, target.root);
  }
}

/** Before any question: in Restricted Mode nothing can be written, so the user learns that first. */
function refusedUntrusted(context: KeyCommandContext): boolean {
  if (context.fileStore.canWrite()) {
    return false;
  }
  void showWriteFailure({ ok: false, reason: 'untrusted' });
  return true;
}
