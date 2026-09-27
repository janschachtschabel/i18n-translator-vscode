import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { clearApiKey, setApiKey } from '../../src/extension/commands/apiKey';
import type { ExtensionApi } from '../../src/extension/extension';
import { activateExtension, answering } from './helpers';

// The test profiles set B_API_KEY to a value of their own (.vscode-test.mjs): a real key of the machine never
// reaches these tests. Assertions compare sources and booleans, so that no failure prints a key.
const TYPED = 'typed-test-key-4711';

suite('b-api key', () => {
  let api: ExtensionApi;

  suiteSetup(async () => {
    api = await activateExtension();
  });

  teardown(async () => {
    await api.ai.keys.clear();
  });

  test('keeps a typed key, trimmed, in the secret storage and in no setting', async () => {
    const prompts = answering(`  ${TYPED} \n`);
    assert.equal(await setApiKey({ keys: api.ai.keys, prompts }), true);
    assert.deepEqual(prompts.asked, ['Set API Key']);
    const key = await api.ai.keys.key();
    assert.equal(key?.source, 'secret');
    assert.ok(key?.value === TYPED, 'the stored key is the typed one');
    const settings = JSON.stringify(vscode.workspace.getConfiguration('eduI18n'));
    assert.ok(!settings.includes(TYPED), 'no setting holds the key');
  });

  test('falls back to the environment once the stored key is removed, after asking', async () => {
    await setApiKey({ keys: api.ai.keys, prompts: answering(TYPED) });
    assert.equal(await clearApiKey({ keys: api.ai.keys, prompts: answering(false) }), false);
    assert.equal(await api.ai.keys.source(), 'secret');
    const prompts = answering(true);
    assert.equal(await clearApiKey({ keys: api.ai.keys, prompts }), true);
    assert.match(prompts.asked[0]!, /^Remove the b-api key from VS Code's secret storage\?/);
    assert.equal(await api.ai.keys.source(), 'env');
  });

  test('stores nothing when the input is cancelled, and asks nothing when no key is stored', async () => {
    assert.equal(await setApiKey({ keys: api.ai.keys, prompts: answering() }), false);
    assert.equal(await api.ai.keys.source(), 'env');
    const prompts = answering(true);
    assert.equal(await clearApiKey({ keys: api.ai.keys, prompts }), false);
    assert.deepEqual(prompts.asked, []);
  });
});
