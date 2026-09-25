import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension/extension';
import type { EditorPanel } from '../../src/extension/panels/editorPanel';
import type { HostToWebview } from '../../src/shared/protocol';

export const EXTENSION_ID = 'janschachtschabel.edu-sharing-i18n';

export async function activateExtension(): Promise<ExtensionApi> {
  const extension = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  if (!extension) {
    throw new Error(`extension ${EXTENSION_ID} is not installed in the test host`);
  }
  return extension.activate();
}

export function workspaceUri(relPath: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('the tests need the fixture workspace folder');
  }
  return vscode.Uri.joinPath(folder.uri, ...relPath.split('/'));
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
