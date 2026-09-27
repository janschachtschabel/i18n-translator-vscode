import * as vscode from 'vscode';
import { allowedBaseUrl, DEFAULT_BASE_URL } from '../../core/config/aiSettings';
import { showInfo } from '../notify';
import type { AiService } from '../services/aiService';
import type { PickItem, Prompts } from './prompts';

/** An example of another address in the prompt: the production b-api. */
const PRODUCTION_BASE_URL = 'https://b-api.prod.openeduhub.net';

/**
 * Asks for the address of the b-api, where the requests and the key go, and keeps it in the user settings, the only
 * place it is read from. Offers the address set, else staging; one the AI may not use is refused while typing. The
 * default address removes the setting, so that a later default applies. Undefined if nothing changed.
 */
export async function setBaseUrl(prompts: Prompts): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('eduI18n');
  const typed = await prompts.input({
    title: vscode.l10n.t('b-api Address'),
    prompt: vscode.l10n.t(
      'The address of the b-api, {staging} (staging, the default) or e.g. {production}. The key goes along with every request.',
      { staging: DEFAULT_BASE_URL, production: PRODUCTION_BASE_URL },
    ),
    value: config.inspect<string>('ai.baseUrl')?.globalValue ?? DEFAULT_BASE_URL,
    check: (text) =>
      allowedBaseUrl(text.trim()) === undefined
        ? {
            message: vscode.l10n.t(
              'Only an https: address (http: only on this machine), without a user, a query or a fragment.',
            ),
          }
        : undefined,
  });
  const url = typed === undefined ? undefined : allowedBaseUrl(typed.trim());
  if (url === undefined) {
    return undefined;
  }
  await config.update(
    'ai.baseUrl',
    url === DEFAULT_BASE_URL ? undefined : url,
    vscode.ConfigurationTarget.Global,
  );
  void showInfo(
    vscode.l10n.t(
      'The AI sends its requests to {host} now; before texts go there the first time, you are asked.',
      {
        host: new URL(url).host,
      },
    ),
  );
  return url;
}

/**
 * The steps of setting up the AI in one place, each with what applies now (the key, the address, the model), and
 * the connection test; runs the step the user picks with `run` (a command id). Undefined if cancelled.
 */
export async function setUpAi(
  ai: AiService,
  prompts: Prompts,
  run: (command: string, ...args: unknown[]) => Thenable<unknown>,
): Promise<string | undefined> {
  const { keySource, settings, host } = await ai.status();
  const keyState = {
    secret: vscode.l10n.t("set, in VS Code's secret storage"),
    env: vscode.l10n.t('from the environment variable B_API_KEY'),
    none: vscode.l10n.t('not set'),
  }[keySource];
  const items: PickItem<string>[] = [
    { label: vscode.l10n.t('Set API Key…'), description: keyState, value: 'eduI18n.setApiKey' },
    {
      label: vscode.l10n.t('Set b-api Address…'),
      description: settings.baseUrl === undefined ? vscode.l10n.t('not usable, the AI is off') : host,
      value: 'eduI18n.setBaseUrl',
    },
    { label: vscode.l10n.t('Choose Model…'), description: settings.model, value: 'eduI18n.selectModel' },
    { label: vscode.l10n.t('Test Connection'), value: 'eduI18n.testAiConnection' },
    ...(keySource === 'secret' ? [{ label: vscode.l10n.t('Remove Key'), value: 'eduI18n.clearApiKey' }] : []),
    {
      label: vscode.l10n.t('Open Settings'),
      description: 'eduI18n.ai',
      value: 'workbench.action.openSettings',
    },
  ];
  const picked = await prompts.pick(
    items,
    vscode.l10n.t('Set up the AI: the address of the b-api, its key, the model'),
  );
  if (picked !== undefined) {
    await (picked === 'workbench.action.openSettings' ? run(picked, 'eduI18n.ai') : run(picked));
  }
  return picked;
}
