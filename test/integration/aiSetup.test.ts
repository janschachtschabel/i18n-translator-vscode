import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { setBaseUrl, setUpAi } from '../../src/extension/commands/aiSetup';
import type { PickItem, Prompts } from '../../src/extension/commands/prompts';
import type { ExtensionApi } from '../../src/extension/extension';
import { activateExtension, answering, settled } from './helpers';

suite('AI setup', () => {
  let api: ExtensionApi;
  const config = () => vscode.workspace.getConfiguration('eduI18n');

  suiteSetup(async () => {
    api = await activateExtension();
  });

  teardown(async () => {
    await config().update('ai.baseUrl', undefined, vscode.ConfigurationTarget.Global);
  });

  test('keeps the address of the b-api in the user settings, and the default as no setting', async () => {
    assert.equal(
      await setBaseUrl(answering('  https://b-api.prod.openeduhub.net/ ')),
      'https://b-api.prod.openeduhub.net',
    );
    assert.equal(config().inspect('ai.baseUrl')?.globalValue, 'https://b-api.prod.openeduhub.net');
    const status = await settled(
      () => api.ai.service.status(),
      (current) => current.host === 'b-api.prod.openeduhub.net',
    );
    assert.equal(status.host, 'b-api.prod.openeduhub.net');

    // The address in effect again: nothing changes.
    assert.equal(await setBaseUrl(answering('https://b-api.prod.openeduhub.net')), undefined);

    // Back to staging: no setting, so that a later default applies.
    assert.equal(
      await setBaseUrl(answering('https://b-api.staging.openeduhub.net')),
      'https://b-api.staging.openeduhub.net',
    );
    assert.equal(config().inspect('ai.baseUrl')?.globalValue, undefined);
    assert.equal(await setBaseUrl(answering('https://b-api.staging.openeduhub.net/')), undefined);
  });

  test('keeps no address the AI may not use, and nothing when cancelled', async () => {
    const asked = answering('http://b-api.prod.openeduhub.net');
    assert.equal(await setBaseUrl(asked), undefined);
    assert.equal(await setBaseUrl(answering()), undefined);
    assert.equal(config().inspect('ai.baseUrl')?.globalValue, undefined);
  });

  test('says first that the AI is turned off, which no step of the setup changes', async () => {
    await config().update('ai.enabled', false, vscode.ConfigurationTarget.Global);
    try {
      await settled(
        () => api.ai.service.status(),
        (current) => !current.available,
      );
      let asked = '';
      const prompts: Prompts = {
        ...answering(),
        pick: async (_items, placeHolder) => ((asked = placeHolder), undefined),
      };
      assert.equal(await setUpAi(api.ai.service, prompts, async () => undefined), undefined);
      assert.match(asked, /^The AI functions are turned off \(eduI18n\.ai\.enabled\)\. Set up the AI/);
    } finally {
      await config().update('ai.enabled', undefined, vscode.ConfigurationTarget.Global);
      await settled(
        () => api.ai.service.status(),
        (current) => current.available,
      );
    }
  });

  test('offers every step of the setup with what applies now, and runs the one picked', async () => {
    let offered: readonly PickItem<string>[] = [];
    const prompts: Prompts = {
      ...answering(),
      pick: async <T>(items: readonly PickItem<T>[]) => {
        offered = items as readonly PickItem<string>[];
        return items.find((item) => item.value === ('eduI18n.setBaseUrl' as T))?.value;
      },
    };
    const ran: unknown[][] = [];
    const picked = await setUpAi(api.ai.service, prompts, async (...args) => void ran.push(args));
    assert.equal(picked, 'eduI18n.setBaseUrl');
    assert.deepEqual(ran, [['eduI18n.setBaseUrl']]);
    // The integration profiles set B_API_KEY; staging is the default; gpt-6-luna the default model.
    assert.deepEqual(
      offered.map(({ value, description }) => [value, description]),
      [
        ['eduI18n.setApiKey', 'from the environment variable B_API_KEY'],
        ['eduI18n.setBaseUrl', 'b-api.staging.openeduhub.net'],
        ['eduI18n.selectModel', 'gpt-6-luna'],
        ['eduI18n.testAiConnection', undefined],
        ['workbench.action.openSettings', 'eduI18n.ai'],
      ],
    );
  });
});
