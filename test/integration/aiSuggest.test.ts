import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import type { EditorPanel } from '../../src/extension/panels/editorPanel';
import type { HostToWebview } from '../../src/shared/protocol';
import { activateExtension, answering, nextPost, settled, workspaceUri } from './helpers';
import { startMockBapi, type MockRequest } from './mockBapi';

const id = (key: string) => keyFromSegments(key.split('.')).id;
const MODELS = { status: 200, body: { data: [{ id: 'gpt-6-luna' }] } };

/** A b-api that answers each text with `<target>:<source>`, or with `status`. */
function translator(status = 200, delayMs = 0) {
  return (request: MockRequest) => {
    if (request.path.endsWith('/models')) {
      return MODELS;
    }
    if (status !== 200) {
      return { status, body: { message: 'refused' } };
    }
    const body = request.body as { messages: { content: string }[] };
    const items = (JSON.parse(body.messages[1]!.content) as { items: { key: string; source: string }[] })
      .items;
    const target = /\[([^\]]+)\]\.?\n/.exec(body.messages[0]!.content)?.[1] ?? '?';
    const answer = { items: items.map(({ key, source }) => ({ key, text: `${target}:${source}` })) };
    return {
      status: 200,
      delayMs,
      body: { choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }] },
    };
  };
}

suite('AI suggestion for a cell', () => {
  let api: ExtensionApi;
  let panel: EditorPanel;
  let bapi: Awaited<ReturnType<typeof startMockBapi>> | undefined;
  const config = () => vscode.workspace.getConfiguration('eduI18n');
  const french = workspaceUri('Frontend/src/assets/i18n/common/fr.json');
  const posts: HostToWebview[] = [];

  suiteSetup(async () => {
    api = await activateExtension();
    const root = (await api.index.refresh()).roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    panel = api.editors.open(root, common);
    panel.onDidPost((message) => posts.push(message));
    await nextPost(panel, 'bundle');
  });

  teardown(async () => {
    await config().update('ai.baseUrl', undefined, vscode.ConfigurationTarget.Global);
    await bapi?.close();
    bapi = undefined;
  });

  async function serve(answer: ReturnType<typeof translator>) {
    bapi = await startMockBapi(answer);
    await config().update('ai.baseUrl', bapi.url, vscode.ConfigurationTarget.Global);
    // The new address applies a moment after the write; checked before anything is sent.
    const status = await settled(
      () => api.ai.service.status(),
      (current) => current.settings.baseUrl === bapi!.url,
    );
    assert.equal(status.settings.baseUrl, bapi.url, 'requests stay on this machine');
    return { server: bapi, host: status.host };
  }

  async function suggest(key: string, locale: string, requestId: string) {
    const answer = nextPost(panel, 'aiSuggestion');
    await panel.receive({ type: 'aiSuggest', requestId, entryId: id(key), locale });
    return answer;
  }

  test('asks once per address before texts go there, and not again', async () => {
    const { host } = await serve(translator());
    const declined = answering(false);
    assert.equal(await api.ai.consent.ensure(host, declined), false);
    assert.match(
      declined.asked[0]!,
      new RegExp(`^The AI sends texts of these translation files to ${host.replace('.', '\\.')}`),
    );
    assert.equal(await api.ai.consent.ensure(host, answering(true)), true);
    const again = answering();
    assert.equal(await api.ai.consent.ensure(host, again), true);
    assert.deepEqual(again.asked, []);
  });

  test('translates the reference text, with other languages as context, and writes nothing', async () => {
    const { server, host } = await serve(translator());
    await api.ai.consent.ensure(host, answering(true));
    const before = await vscode.workspace.fs.readFile(french);
    const answer = await suggest('CANCEL', 'fr', 's1');
    assert.deepEqual(answer, { type: 'aiSuggestion', requestId: 's1', text: 'fr:Abbrechen' });
    const body = server.requests.at(-1)!.body as { messages: { content: string }[] };
    assert.match(body.messages[0]!.content, /to French \[fr\]/);
    const [item] = (
      JSON.parse(body.messages[1]!.content) as {
        items: { key: string; source: string; context?: Record<string, string> }[];
      }
    ).items;
    assert.equal(item!.key, 'CANCEL');
    assert.equal(item!.source, 'Abbrechen');
    assert.equal(item!.context?.['en'], 'Cancel');
    assert.deepEqual(await vscode.workspace.fs.readFile(french), before);
  });

  test('adapts a variant from its base language', async () => {
    const { server, host } = await serve(translator());
    await api.ai.consent.ensure(host, answering(true));
    const answer = await suggest('PERSON', 'de-no-binnen-i', 's2');
    assert.equal(answer.text, 'de-no-binnen-i:Autor{{GENDER_SEPARATOR}}in');
    const body = server.requests.at(-1)!.body as { messages: { content: string }[] };
    assert.match(body.messages[0]!.content, /Adapt the texts to .*\[de-no-binnen-i\]/);
  });

  test('says why there is no suggestion: no source text, a refused key', async () => {
    const { host } = await serve(translator(401));
    await api.ai.consent.ensure(host, answering(true));
    assert.match(
      (await suggest('OLD_KEY', 'fr', 's3')).message ?? '',
      /OLD_KEY has no text in de to translate from/,
    );
    assert.match((await suggest('CANCEL', 'fr', 's4')).message ?? '', /refused the key \(HTTP 401\)/);
  });

  test('answers nothing to a request the editor cancelled', async () => {
    const { host } = await serve(translator(200, 3000));
    await api.ai.consent.ensure(host, answering(true));
    const count = posts.filter((message) => message.type === 'aiSuggestion').length;
    const done = panel.receive({ type: 'aiSuggest', requestId: 's5', entryId: id('CANCEL'), locale: 'fr' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await panel.receive({ type: 'aiCancel', requestId: 's5' });
    await done;
    assert.equal(posts.filter((message) => message.type === 'aiSuggestion').length, count);
  });

  test('tells the editor whether the AI can be used, on every start', async () => {
    const state = nextPost(panel, 'aiState');
    await panel.receive({ type: 'ready' });
    assert.deepEqual(await state, { type: 'aiState', available: true, model: 'gpt-6-luna' });
  });
});
