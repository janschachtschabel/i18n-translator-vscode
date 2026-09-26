import * as vscode from 'vscode';
import { showInfo } from '../notify';
import { keyProblem, type ApiKeyStore } from '../services/apiKeyStore';
import type { Prompts } from './prompts';

export interface ApiKeyContext {
  keys: ApiKeyStore;
  prompts: Prompts;
}

/**
 * Asks for the b-api key and keeps it in VS Code's secret storage; false if the user cancelled. The box masks the
 * key and stays open while the user copies it from elsewhere; no message names the key.
 */
export async function setApiKey({ keys, prompts }: ApiKeyContext): Promise<boolean> {
  const typed = await prompts.input({
    title: vscode.l10n.t('Set API Key'),
    prompt: vscode.l10n.t(
      'The key of the b-api, the same as B_API_KEY of the old app. VS Code keeps it in its secret storage, which the operating system encrypts.',
    ),
    password: true,
    ignoreFocusOut: true,
    check: (text) => {
      const problem = keyProblem(text);
      return problem && { message: problemMessage(problem) };
    },
  });
  if (typed === undefined) {
    return false;
  }
  await keys.set(typed);
  void showInfo(vscode.l10n.t("The b-api key is saved in VS Code's secret storage."));
  return true;
}

/** Removes the stored key after asking; false if there was none or the user kept it. */
export async function clearApiKey({ keys, prompts }: ApiKeyContext): Promise<boolean> {
  if ((await keys.source()) !== 'secret') {
    void showInfo(
      (await keys.source()) === 'env'
        ? vscode.l10n.t(
            'No b-api key is stored in VS Code. The key comes from the environment variable B_API_KEY; remove it there.',
          )
        : vscode.l10n.t('No b-api key is stored in VS Code.'),
    );
    return false;
  }
  const remove = vscode.l10n.t('Remove Key');
  if (
    !(await prompts.confirm(vscode.l10n.t("Remove the b-api key from VS Code's secret storage?"), remove))
  ) {
    return false;
  }
  await keys.clear();
  void showInfo(
    (await keys.source()) === 'env'
      ? vscode.l10n.t(
          'The b-api key is removed from VS Code. The environment variable B_API_KEY still applies.',
        )
      : vscode.l10n.t('The b-api key is removed from VS Code. The AI functions are off until a key is set.'),
  );
  return true;
}

function problemMessage(problem: NonNullable<ReturnType<typeof keyProblem>>): string {
  switch (problem) {
    case 'empty':
      return vscode.l10n.t('Enter the key.');
    case 'blank':
      return vscode.l10n.t('A key has no spaces or line breaks.');
    case 'too-long':
      return vscode.l10n.t('The key is longer than 512 characters.');
  }
}
