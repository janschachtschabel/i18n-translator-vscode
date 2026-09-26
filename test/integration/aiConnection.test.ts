import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { selectModel, testAiConnection } from '../../src/extension/commands/aiConnection';
import type { ExtensionApi } from '../../src/extension/extension';
import { activateExtension, answering } from './helpers';
import { startMockBapi, type MockAnswer, type MockRequest } from './mockBapi';

// The profiles set B_API_KEY to a key of their own (.vscode-test.mjs); every request goes to a server on this
// machine, which the tests check before they send anything.
const TEST_KEY = 'environment-test-key';
const MODELS: MockAnswer = {
  status: 200,
  body: { data: [{ id: 'gpt-6-luna' }, { id: 'gpt-4.1' }, { id: 'whisper-1' }] },
};
const OK: MockAnswer = {
  status: 200,
  body: { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] },
};

suite('AI connection', () => {
  let api: ExtensionApi;
  let bapi: Awaited<ReturnType<typeof startMockBapi>> | undefined;
  const log = vscode.window.createOutputChannel('edu-sharing i18n tests', { log: true });
  const config = () => vscode.workspace.getConfiguration('eduI18n');

  suiteSetup(async () => {
    api = await activateExtension();
  });

  teardown(async () => {
    await config().update('ai.baseUrl', undefined, vscode.ConfigurationTarget.Global);
    await config().update('ai.model', undefined, vscode.ConfigurationTarget.Global);
    await bapi?.close();
    bapi = undefined;
  });

  suiteTeardown(() => log.dispose());

  /** Starts the mock b-api and points the settings at it. */
  async function serve(answer: (request: MockRequest) => MockAnswer) {
    bapi = await startMockBapi(answer);
    await config().update('ai.baseUrl', bapi.url, vscode.ConfigurationTarget.Global);
    const status = await api.ai.service.status();
    assert.match(status.settings.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/, 'requests stay on this machine');
    assert.equal(status.keySource, 'env');
    return bapi;
  }

  test('asks the configured model the way its profile needs, with the key in X-API-KEY', async () => {
    const server = await serve((request) => (request.path.endsWith('/models') ? MODELS : OK));
    assert.equal(await testAiConnection(api.ai.service, log), 'connected');
    assert.deepEqual(
      server.requests.map(({ method, path }) => `${method} ${path}`),
      ['GET /api/v1/llm/openai/models', 'POST /api/v1/llm/openai/chat/completions'],
    );
    assert.ok(server.requests.every((request) => request.key === TEST_KEY));
    const body = server.requests[1]!.body as Record<string, unknown>;
    assert.equal(body['model'], 'gpt-6-luna');
    assert.equal(body['reasoning_effort'], 'low');
    assert.ok(!('temperature' in body) && !('max_tokens' in body));
  });

  test('says when the key is refused, and when the model is not offered, without asking it', async () => {
    await serve(() => ({ status: 401, body: { message: 'Unauthorized' } }));
    assert.equal(await testAiConnection(api.ai.service, log), 'unauthorized');
    await bapi!.close();
    const server = await serve(() => ({ status: 200, body: { data: [{ id: 'gpt-4.1' }] } }));
    assert.equal(await testAiConnection(api.ai.service, log), 'model-missing');
    assert.equal(server.requests.length, 1);
  });

  test('offers the chat models to choose from and keeps the choice in the user settings', async () => {
    await serve(() => MODELS);
    assert.equal(await selectModel(api.ai.service, answering('whisper-1'), log), undefined);
    assert.equal(await selectModel(api.ai.service, answering('gpt-4.1'), log), 'gpt-4.1');
    assert.equal(config().inspect('ai.model')?.globalValue, 'gpt-4.1');
    assert.equal((await api.ai.service.status()).settings.model, 'gpt-4.1');
  });

  test('takes the address of the b-api from the user settings only, never from the workspace', async () => {
    try {
      await config().update('ai.baseUrl', 'https://elsewhere.example', vscode.ConfigurationTarget.Workspace);
    } catch {
      // VS Code may refuse to write a machine setting into the workspace; either way it must not apply.
    }
    try {
      assert.equal((await api.ai.service.status()).settings.baseUrl, 'https://b-api.staging.openeduhub.net');
    } finally {
      await config()
        .update('ai.baseUrl', undefined, vscode.ConfigurationTarget.Workspace)
        .then(undefined, () => undefined);
    }
  });
});
