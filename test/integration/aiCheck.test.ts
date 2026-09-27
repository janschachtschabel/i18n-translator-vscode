import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import type { HostToWebview } from '../../src/shared/protocol';
import {
  activateExtension,
  answering,
  editorWith,
  jobEnd,
  keepTranslationFiles,
  PAGE_LOAD_MS,
  settled,
  waitFor,
  workspaceUri,
} from './helpers';
import { startMockBapi, type MockRequest } from './mockBapi';

const id = (key: string) => keyFromSegments(key.split('.')).id;

/** A b-api that finds the wrong placeholder of a translation, and nothing else. */
function checker(request: MockRequest) {
  if (request.path.endsWith('/models')) {
    return { status: 200, body: { data: [{ id: 'gpt-6-luna' }] } };
  }
  const body = request.body as { messages: { content: string }[] };
  const items = (JSON.parse(body.messages[1]!.content) as { items: { key: string; translation: string }[] })
    .items;
  const verdicts = items.map(({ key, translation }) =>
    translation.includes('{{data}}')
      ? {
          key,
          verdict: 'problem',
          severity: 'error',
          problem: 'Der Platzhalter {{date}} heißt hier {{data}}.',
          suggestion: translation.replace('{{data}}', '{{date}}'),
        }
      : { key, verdict: 'ok', severity: 'info', problem: '', suggestion: '' },
  );
  return {
    status: 200,
    body: { choices: [{ message: { content: JSON.stringify({ items: verdicts }) }, finish_reason: 'stop' }] },
  };
}

suite('Check with AI', function () {
  this.timeout(2 * PAGE_LOAD_MS);
  let api: ExtensionApi;
  let bapi: Awaited<ReturnType<typeof startMockBapi>>;
  const config = () => vscode.workspace.getConfiguration('eduI18n');
  const french = workspaceUri('Frontend/src/assets/i18n/common/fr.json');
  const read = async () => new TextDecoder().decode(await vscode.workspace.fs.readFile(french));

  suiteSetup(async () => {
    api = await activateExtension();
    bapi = await startMockBapi(checker);
    await config().update('ai.baseUrl', bapi.url, vscode.ConfigurationTarget.Global);
    const status = await settled(
      () => api.ai.service.status(),
      (current) => current.settings.baseUrl === bapi.url,
    );
    assert.equal(status.settings.baseUrl, bapi.url, 'requests stay on this machine');
    await api.ai.consent.ensure(status.host, answering(true));
  });

  suiteTeardown(async () => {
    await config().update('ai.baseUrl', undefined, vscode.ConfigurationTarget.Global);
    await bapi.close();
  });

  let restoreFiles: () => Promise<void>;

  setup(async () => {
    restoreFiles = await keepTranslationFiles();
  });

  teardown(async () => {
    await restoreFiles();
  });

  test('checks the translations of a language, and lists what it finds with a correction', async () => {
    const prompts = answering('fr');
    const { editorPanel, posts, close } = await editorWith(api, prompts);
    try {
      const ended = jobEnd({ editorPanel, posts }, prompts);
      await editorPanel.receive({ type: 'aiCheck' });
      assert.deepEqual(await ended, { type: 'aiJobEnd', jobId: 'check-1', status: 'done', missing: 0 });
      assert.deepEqual(
        posts.find((message) => message.type === 'aiJob'),
        { type: 'aiJob', jobId: 'check-1', kind: 'check', locale: 'fr', source: 'de', total: 9 },
      );
      const items = posts.flatMap((message) => (message.type === 'aiJobItems' ? message.items : []));
      assert.deepEqual(items, [
        {
          entryId: id('ERROR_TITLE'),
          source: 'Fehler ({{date}})',
          before: 'Erreur ({{data}})',
          text: 'Erreur ({{date}})',
          problem: { severity: 'error', message: 'Der Platzhalter {{date}} heißt hier {{data}}.' },
        },
      ]);
      // The check weighs more: its own reasoning effort, and its own schema.
      const body = bapi.requests.at(-1)!.body as {
        reasoning_effort: string;
        response_format: { json_schema: { name: string } };
      };
      assert.equal(body.reasoning_effort, 'medium');
      assert.equal(body.response_format.json_schema.name, 'check');
    } finally {
      close();
    }
  });

  // The question before a job of many requests had no test: a changed threshold, or an answer it ignored, kept every
  // test green (audit T-15). One text per request makes the check of the 9 French texts 9 requests.
  test('asks before a job of five or more requests, and sends nothing when the answer is no', async () => {
    await config().update('ai.batchSize', 1, vscode.ConfigurationTarget.Global);
    const prompts = answering('fr', false);
    const { editorPanel, posts, close } = await editorWith(api, prompts);
    const sent = bapi.requests.length;
    try {
      await settled(
        () => api.ai.service.status(),
        (current) => current.settings.batchSize === 1,
      );
      await editorPanel.receive({ type: 'aiCheck' });
      assert.match(
        prompts.asked.at(-1) ?? '',
        /^Check 9 texts of common in fr\? That takes about 9 requests/,
      );
      assert.equal(bapi.requests.length, sent);
      assert.equal(
        posts.some((message) => message.type === 'aiJob'),
        false,
      );
    } finally {
      close();
      await config().update('ai.batchSize', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // Nor had a declined consent before a job: without the question, texts would go to a new address (audit T-15).
  test('asks for the consent before a job at a new address, and sends nothing when the answer is no', async () => {
    const other = await startMockBapi(checker);
    const prompts = answering('fr', false);
    const { editorPanel, posts, close } = await editorWith(api, prompts);
    try {
      await config().update('ai.baseUrl', other.url, vscode.ConfigurationTarget.Global);
      await settled(
        () => api.ai.service.status(),
        (current) => current.settings.baseUrl === other.url,
      );
      await editorPanel.receive({ type: 'aiCheck' });
      assert.match(
        prompts.asked.at(-1) ?? '',
        /^The AI sends texts of these translation files to 127\.0\.0\.1:/,
      );
      assert.deepEqual(other.requests, []);
      assert.equal(
        posts.some((message) => message.type === 'aiJob'),
        false,
      );
    } finally {
      close();
      await config().update('ai.baseUrl', bapi.url, vscode.ConfigurationTarget.Global);
      await settled(
        () => api.ai.service.status(),
        (current) => current.settings.baseUrl === bapi.url,
      );
      await other.close();
    }
  });

  test('writes a chosen correction against the text it checked, which one undo takes back', async () => {
    const prompts = answering('fr');
    const { editorPanel, posts, close } = await editorWith(api, prompts);
    const before = await read();
    try {
      const ended = jobEnd({ editorPanel, posts }, prompts);
      await editorPanel.receive({ type: 'aiCheck' });
      await ended;
      const [item] = posts.flatMap((message) => (message.type === 'aiJobItems' ? message.items : []));
      const result = waitFor(editorPanel.onDidPost, (message) => message.type === 'aiApplyResult');
      await editorPanel.receive({
        type: 'aiApply',
        requestId: 'apply-c1',
        jobId: 'check-1',
        items: [{ entryId: item!.entryId, value: item!.text, before: item!.before }],
      });
      assert.deepEqual((await result) as Extract<HostToWebview, { type: 'aiApplyResult' }>, {
        type: 'aiApplyResult',
        requestId: 'apply-c1',
        written: [id('ERROR_TITLE')],
        skipped: [],
      });
      assert.match(await read(), /"ERROR_TITLE": "Erreur \(\{\{date\}\}\)"/);
      assert.equal((await api.fileStore.undo())?.ok, true);
      assert.equal(await read(), before);
    } finally {
      close();
    }
  });
});
