import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import type { EditorPanel } from '../../src/extension/panels/editorPanel';
import type { HostToWebview } from '../../src/shared/protocol';
import {
  activateExtension,
  answering,
  editorWith,
  nextPost,
  PAGE_LOAD_MS,
  settled,
  waitFor,
  workspaceUri,
} from './helpers';
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

suite('AI suggestion for a cell', function () {
  this.timeout(2 * PAGE_LOAD_MS);

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
    assert.equal(answer.text, 'de-no-binnen-i:Autor{{GENDER_SEPARATOR}}in', JSON.stringify(answer));
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

  test('answers nothing to a request the editor cancelled, and sends none cancelled before it went', async () => {
    const { server, host } = await serve(translator(200, 3000));
    await api.ai.consent.ensure(host, answering(true));
    const count = posts.filter((message) => message.type === 'aiSuggestion').length;
    const done = panel.receive({ type: 'aiSuggest', requestId: 's5', entryId: id('CANCEL'), locale: 'fr' });
    // At once, while the host still reads the settings: the cancel must not get lost.
    await panel.receive({ type: 'aiCancel', requestId: 's5' });
    await done;
    assert.equal(posts.filter((message) => message.type === 'aiSuggestion').length, count);
    assert.equal(server.requests.filter((request) => request.path.endsWith('/chat/completions')).length, 0);
  });

  test('asks for the consent only when there is a text to send, and sends nothing without it', async () => {
    const { server } = await serve(translator());
    const declined = answering(false);
    const first = await editorWith(api, declined);
    const answerOf = async (editor: typeof first, key: string, requestId: string) => {
      const answer = waitFor(editor.editorPanel.onDidPost, (message) => message.type === 'aiSuggestion');
      await editor.editorPanel.receive({ type: 'aiSuggest', requestId, entryId: id(key), locale: 'fr' });
      return (await answer) as Extract<HostToWebview, { type: 'aiSuggestion' }>;
    };
    try {
      // Nothing to translate: no question.
      assert.match((await answerOf(first, 'OLD_KEY', 'c1')).message ?? '', /OLD_KEY has no text in de/);
      assert.deepEqual(declined.asked, []);
      assert.match((await answerOf(first, 'CANCEL', 'c2')).message ?? '', /No texts were sent/);
      assert.equal(declined.asked.length, 1);
      assert.deepEqual(
        server.requests.filter((request) => request.path.endsWith('/chat/completions')),
        [],
        'nothing went out without the consent',
      );
    } finally {
      first.close();
    }
    const accepted = answering(true);
    const second = await editorWith(api, accepted);
    try {
      assert.equal((await answerOf(second, 'CANCEL', 'c3')).text, 'fr:Abbrechen');
      assert.equal((await answerOf(second, 'SAVE', 'c4')).text, 'fr:Speichern');
      assert.equal(accepted.asked.length, 1, 'asked once for the address');
    } finally {
      second.close();
    }
  });

  test('cancels the requests of a page that reloads', async () => {
    const { host } = await serve(translator(200, 3000));
    await api.ai.consent.ensure(host, answering(true));
    const count = posts.filter((message) => message.type === 'aiSuggestion').length;
    const started = Date.now();
    const done = panel.receive({ type: 'aiSuggest', requestId: 's6', entryId: id('CANCEL'), locale: 'fr' });
    // At once, while the host still reads the settings.
    await panel.receive({ type: 'ready' });
    await done;
    assert.ok(Date.now() - started < 2500, 'the request ended with its page');
    assert.equal(posts.filter((message) => message.type === 'aiSuggestion').length, count);
  });

  test('tells the editor whether the AI can be used, on every start', async () => {
    const state = nextPost(panel, 'aiState');
    await panel.receive({ type: 'ready' });
    assert.deepEqual(await state, { type: 'aiState', available: true, model: 'gpt-6-luna' });
  });
});
