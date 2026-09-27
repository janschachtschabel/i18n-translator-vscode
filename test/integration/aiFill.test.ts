import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import type { ExtensionApi } from '../../src/extension/extension';
import type { AiJobItem } from '../../src/shared/aiProtocol';
import type { HostToWebview } from '../../src/shared/protocol';
import { activateExtension, answering, editorWith, settled, waitFor, workspaceUri } from './helpers';
import { startMockBapi, type MockRequest } from './mockBapi';

const id = (key: string) => keyFromSegments(key.split('.')).id;

/** A b-api that answers each text with `<source> (fr)`. */
function translator(request: MockRequest) {
  if (request.path.endsWith('/models')) {
    return { status: 200, body: { data: [{ id: 'gpt-6-luna' }] } };
  }
  const body = request.body as { messages: { content: string }[] };
  const items = (JSON.parse(body.messages[1]!.content) as { items: { key: string; source: string }[] }).items;
  // In reverse order: the texts come back by key, not by position.
  const answer = { items: items.reverse().map(({ key, source }) => ({ key, text: `${source} (fr)` })) };
  return {
    status: 200,
    body: { choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }] },
  };
}

suite('Fill with AI', () => {
  let api: ExtensionApi;
  let bapi: Awaited<ReturnType<typeof startMockBapi>>;
  const config = () => vscode.workspace.getConfiguration('eduI18n');
  const french = workspaceUri('Frontend/src/assets/i18n/common/fr.json');
  const read = async () => new TextDecoder().decode(await vscode.workspace.fs.readFile(french));

  suiteSetup(async () => {
    api = await activateExtension();
    bapi = await startMockBapi(translator);
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

  /** An editor of `common` whose questions the answers answer, and the messages it sends to its webview. */
  async function editor(...answers: (string | boolean)[]) {
    const prompts = answering(...answers);
    return { ...(await editorWith(api, prompts)), prompts };
  }

  test('asks which language, and suggests its missing and empty texts, by key', async () => {
    const { editorPanel, posts, prompts, close } = await editor('fr');
    try {
      const ended = waitFor(editorPanel.onDidPost, (message) => message.type === 'aiJobEnd');
      await editorPanel.receive({ type: 'aiFill' });
      assert.deepEqual(await ended, { type: 'aiJobEnd', jobId: 'fill-1', status: 'done', missing: 0 });
      // Picking the language is no question `asked` keeps; a few texts need no confirmation, the consent was given.
      assert.deepEqual(prompts.asked, []);
      const job = posts.find((message) => message.type === 'aiJob');
      assert.deepEqual(job, {
        type: 'aiJob',
        jobId: 'fill-1',
        kind: 'fill',
        locale: 'fr',
        source: 'de',
        total: 3,
      });
      const items = posts.flatMap((message) => (message.type === 'aiJobItems' ? message.items : []));
      assert.deepEqual(
        items.sort((a, b) => a.entryId.localeCompare(b.entryId)),
        [
          { entryId: id('CANCEL'), source: 'Abbrechen', before: null, text: 'Abbrechen (fr)' },
          { entryId: id('SAVE'), source: 'Speichern', before: '', text: 'Speichern (fr)' },
          { entryId: id('WORKSPACE.FILE.TITLE'), source: 'Datei', before: null, text: 'Datei (fr)' },
        ].sort((a, b) => a.entryId.localeCompare(b.entryId)),
      );
    } finally {
      close();
    }
  });

  test('writes the reviewed texts as one change, which one undo takes back', async () => {
    const { editorPanel, posts, close } = await editor('fr');
    const before = await read();
    try {
      const ended = waitFor(editorPanel.onDidPost, (message) => message.type === 'aiJobEnd');
      await editorPanel.receive({ type: 'aiFill' });
      await ended;
      const items = posts.flatMap((message) => (message.type === 'aiJobItems' ? message.items : []));
      const chosen = (key: string, text?: string) => {
        const item = items.find((candidate) => candidate.entryId === id(key)) as AiJobItem;
        return { entryId: item.entryId, value: text ?? item.text, before: item.before };
      };
      const result = waitFor(editorPanel.onDidPost, (message) => message.type === 'aiApplyResult');
      await editorPanel.receive({
        type: 'aiApply',
        requestId: 'apply-1',
        jobId: 'fill-1',
        items: [
          chosen('CANCEL', 'Annuler'),
          chosen('WORKSPACE.FILE.TITLE'),
          { entryId: id('ASK'), value: 'Stolen', before: null },
        ],
      });
      assert.deepEqual(await result, {
        type: 'aiApplyResult',
        requestId: 'apply-1',
        written: [id('CANCEL'), id('WORKSPACE.FILE.TITLE')],
        skipped: [],
      });
      const after = await read();
      assert.match(after, /"CANCEL": "Annuler"/);
      assert.match(after, /"TITLE": "Datei \(fr\)"/);
      assert.ok(!after.includes('Stolen'), 'a text outside the job is not written');
      assert.equal((await api.fileStore.undo())?.ok, true);
      assert.equal(await read(), before);
    } finally {
      close();
    }
  });

  test('skips a text that changed meanwhile, and writes nothing for an older job', async () => {
    const { editorPanel, posts, close } = await editor('fr');
    const before = await read();
    try {
      const ended = waitFor(editorPanel.onDidPost, (message) => message.type === 'aiJobEnd');
      await editorPanel.receive({ type: 'aiFill' });
      await ended;
      const result = waitFor(editorPanel.onDidPost, (message) => message.type === 'aiApplyResult');
      await editorPanel.receive({
        type: 'aiApply',
        requestId: 'apply-2',
        jobId: 'fill-1',
        items: [{ entryId: id('SAVE'), value: 'Sauvegarder', before: 'something else' }],
      });
      const answer = (await result) as Extract<HostToWebview, { type: 'aiApplyResult' }>;
      assert.deepEqual(answer.written, []);
      assert.deepEqual(
        answer.skipped.map((skip) => skip.entryId),
        [id('SAVE')],
      );
      assert.match(answer.skipped[0]!.message, /changed in the meantime/);
      const stale = waitFor(editorPanel.onDidPost, (message) => message.type === 'aiApplyResult');
      await editorPanel.receive({ type: 'aiApply', requestId: 'apply-3', jobId: 'fill-0', items: [] });
      assert.match(((await stale) as { message?: string }).message ?? '', /older job/);
      assert.equal(await read(), before);
      assert.ok(posts.length > 0);
    } finally {
      close();
    }
  });
});
