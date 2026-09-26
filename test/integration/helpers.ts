import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension/extension';
import type { EditorPanel } from '../../src/extension/panels/editorPanel';
import type { Prompts } from '../../src/extension/commands/prompts';
import { sameBytes } from '../../src/extension/services/files';
import type { HostToWebview } from '../../src/shared/protocol';

export const EXTENSION_ID = 'janschachtschabel.edu-sharing-i18n';

export async function activateExtension(): Promise<ExtensionApi> {
  const extension = vscode.extensions.getExtension<ExtensionApi | undefined>(EXTENSION_ID);
  if (!extension) {
    throw new Error(`extension ${EXTENSION_ID} is not installed in the test host`);
  }
  const api = await extension.activate();
  if (!api) {
    throw new Error(`extension ${EXTENSION_ID} returns its API only in test mode`);
  }
  return api;
}

export function workspaceUri(relPath: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('the tests need the fixture workspace folder');
  }
  return vscode.Uri.joinPath(folder.uri, ...relPath.split('/'));
}

/**
 * The translation files of the fixture as they are now, and a way back to them: a suite that writes calls it in
 * `teardown`, so that no test sees the changes of another, also after a failed assertion (audit T-08). Files that
 * appeared go, the others get their bytes back; unchanged files are left alone.
 */
export async function keepTranslationFiles(): Promise<() => Promise<void>> {
  const files = () => vscode.workspace.findFiles('Frontend/src/assets/i18n/**/*.json');
  const original = await Promise.all(
    (await files()).map(async (uri) => [uri, await vscode.workspace.fs.readFile(uri)] as const),
  );
  return async () => {
    const known = new Set(original.map(([uri]) => uri.toString()));
    for (const uri of await files()) {
      if (!known.has(uri.toString())) {
        await vscode.workspace.fs.delete(uri);
      }
    }
    for (const [uri, bytes] of original) {
      const now = await vscode.workspace.fs.readFile(uri).then(
        (current) => current,
        () => undefined,
      );
      if (!now || !sameBytes(now, bytes)) {
        await vscode.workspace.fs.writeFile(uri, bytes);
      }
    }
  };
}

/** Resolves with the first event value that satisfies `predicate`, or rejects after `timeoutMs`. */
export function waitFor<T>(
  event: vscode.Event<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 10000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`no matching event within ${timeoutMs} ms`));
    }, timeoutMs);
    const subscription = event((value) => {
      if (predicate(value)) {
        clearTimeout(timer);
        subscription.dispose();
        resolve(value);
      }
    });
  });
}

/** The next message of `type` the host sends to the webview. */
export function nextPost<T extends HostToWebview['type']>(
  panel: EditorPanel,
  type: T,
): Promise<Extract<HostToWebview, { type: T }>> {
  return waitFor(panel.onDidPost, (message) => message.type === type) as Promise<
    Extract<HostToWebview, { type: T }>
  >;
}

/**
 * Answers the questions of a command in their order: text, true/false, the index of an action, or the label of
 * an item; a missing answer cancels. `asked` keeps the questions.
 */
export function answering(...answers: (string | boolean | number)[]): Prompts & { asked: string[] } {
  const asked: string[] = [];
  const next = () => answers.shift();
  return {
    asked,
    input: async ({ title }) => (asked.push(title), next() as string | undefined),
    confirm: async (message) => (asked.push(message), (next() as boolean | undefined) ?? false),
    choose: async (message, actions) => {
      asked.push(message);
      const index = next() as number | undefined;
      return index === undefined ? undefined : actions[index];
    },
    pick: async (items) => {
      const label = next() as string | undefined;
      return items.find((item) => item.label === label)?.value;
    },
  };
}
