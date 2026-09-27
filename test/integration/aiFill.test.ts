import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import type { PickItem } from '../../src/extension/commands/prompts';
import type { ExtensionApi } from '../../src/extension/extension';
import type { AiJobItem } from '../../src/shared/aiProtocol';
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

suite('Fill with AI', function () {
  this.timeout(2 * PAGE_LOAD_MS);

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

  let restoreFiles: () => Promise<void>;

  setup(async () => {
    restoreFiles = await keepTranslationFiles();
  });

  teardown(async () => {
    await restoreFiles();
  });

  /** An editor of `common` whose questions the answers answer, and the messages it sends to its webview. */
  async function editor(...answers: (string | boolean)[]) {
    const prompts = answering(...answers);
    return { ...(await editorWith(api, prompts)), prompts };
  }

  test('asks which language, and suggests its missing and empty texts, by key', async () => {
    const { editorPanel, posts, prompts, close } = await editor('fr');
    try {
      const ended = jobEnd({ editorPanel, posts }, prompts);
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
    const { editorPanel, posts, prompts, close } = await editor('fr');
    const before = await read();
    try {
      const ended = jobEnd({ editorPanel, posts }, prompts);
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
        skipped: [
          {
            entryId: id('ASK'),
            message: 'This text does not belong to the job of the list; it was not written.',
          },
        ],
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
    const { editorPanel, posts, prompts, close } = await editor('fr');
    const before = await read();
    try {
      const ended = jobEnd({ editorPanel, posts }, prompts);
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

  test('ends a job the b-api refuses as failed, and says why', async () => {
    const refusing = await startMockBapi(() => ({ status: 401, body: { message: 'refused' } }));
    await config().update('ai.baseUrl', refusing.url, vscode.ConfigurationTarget.Global);
    try {
      const status = await settled(
        () => api.ai.service.status(),
        (current) => current.settings.baseUrl === refusing.url,
      );
      await api.ai.consent.ensure(status.host, answering(true));
      const { editorPanel, posts, prompts, close } = await editor('fr');
      try {
        const ended = jobEnd({ editorPanel, posts }, prompts);
        await editorPanel.receive({ type: 'aiFill' });
        const end = await ended;
        assert.deepEqual([end.status, end.missing], ['failed', 3]);
        assert.match(end.message ?? '', /refused the key \(HTTP 401\)/);
        assert.deepEqual(
          posts.filter((message) => message.type === 'aiJobItems'),
          [],
        );
      } finally {
        close();
      }
    } finally {
      await config().update('ai.baseUrl', bapi.url, vscode.ConfigurationTarget.Global);
      await settled(
        () => api.ai.service.status(),
        (current) => current.settings.baseUrl === bapi.url,
      );
      await refusing.close();
    }
  });

  test('answers reviewed texts it cannot read, so that their list stops waiting', async () => {
    const { editorPanel, close } = await editor();
    const before = await read();
    try {
      const result = waitFor(editorPanel.onDidPost, (message) => message.type === 'aiApplyResult');
      await editorPanel.receive({
        type: 'aiApply',
        requestId: 'apply-9',
        jobId: 'fill-1',
        items: [{ entryId: 7, value: 'Annuler', before: null }],
      });
      assert.deepEqual(await result, {
        type: 'aiApplyResult',
        requestId: 'apply-9',
        written: [],
        skipped: [],
        message: 'The texts could not be read; nothing was written.',
      });
      assert.equal(await read(), before);
    } finally {
      close();
    }
  });

  test('sends nothing for a job the editor cancels as its list appears', async () => {
    const { editorPanel, posts, prompts, close } = await editor('fr');
    const sent = bapi.requests.length;
    try {
      // The event comes before the message is on its way: the cancel reaches the job before its first request.
      editorPanel.onDidPost((message) => {
        if (message.type === 'aiJob') {
          void editorPanel.receive({ type: 'aiCancel', requestId: message.jobId });
        }
      });
      const ended = jobEnd({ editorPanel, posts }, prompts);
      await editorPanel.receive({ type: 'aiFill' });
      assert.deepEqual(await ended, { type: 'aiJobEnd', jobId: 'fill-1', status: 'cancelled', missing: 3 });
      assert.equal(bapi.requests.length, sent, 'no request went out');
    } finally {
      close();
    }
  });

  test('starts no job when its page reloads or its editor closes while the language is asked', async () => {
    for (const interruption of ['reload', 'close'] as const) {
      let interrupt = async (): Promise<void> => undefined;
      const prompts = {
        ...answering(),
        pick: async <T>(items: readonly PickItem<T>[]) => {
          await interrupt();
          return items.find((item) => item.label === 'fr')?.value;
        },
      };
      const opened = await editorWith(api, prompts);
      interrupt = async () =>
        interruption === 'reload' ? opened.editorPanel.receive({ type: 'ready' }) : opened.close();
      const sent = bapi.requests.length;
      try {
        await opened.editorPanel.receive({ type: 'aiFill' });
        assert.deepEqual(
          opened.posts.filter((message) => message.type === 'aiJob' || message.type === 'aiJobEnd'),
          [],
          interruption,
        );
        assert.equal(bapi.requests.length, sent, `${interruption}: no request went out`);
      } finally {
        opened.close();
      }
    }
  });

  test('lets a job still asking for its language give way to a new start', async () => {
    let startAgain: (() => Promise<void>) | undefined;
    let second: Promise<void> | undefined;
    const prompts = {
      ...answering(),
      pick: async <T>(items: readonly PickItem<T>[]) => {
        // Started again while the choice is open (VS Code shows only the new one): the new start takes over.
        if (startAgain) {
          second = startAgain();
          startAgain = undefined;
        }
        return items.find((item) => item.label === 'fr')?.value;
      },
    };
    const opened = await editorWith(api, prompts);
    startAgain = () => opened.editorPanel.receive({ type: 'aiFill' });
    try {
      const ended = jobEnd(opened, prompts);
      await opened.editorPanel.receive({ type: 'aiFill' });
      await second;
      assert.deepEqual(await ended, { type: 'aiJobEnd', jobId: 'fill-2', status: 'done', missing: 0 });
      assert.deepEqual(
        opened.posts.flatMap((message) => (message.type === 'aiJob' ? [message.jobId] : [])),
        ['fill-2'],
      );
    } finally {
      opened.close();
    }
  });
});
