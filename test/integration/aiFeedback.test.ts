import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FILL } from '../../src/extension/panels/aiFill';
import { AiJobs } from '../../src/extension/panels/aiJobs';
import { offer } from '../../src/extension/services/aiFeedback';
import type { AiService } from '../../src/extension/services/aiService';
import { activateExtension, answering } from './helpers';

// A step chosen from a message, such as "Set API Key…" or "Choose Model…", that failed (no keyring on Linux, a
// settings.json with errors) became an unhandled rejection, and nothing told the user (audit API-03).
suite('AI feedback', () => {
  test('shows the failure of a step chosen from a message, instead of rejecting', async () => {
    let ran = false;
    await assert.doesNotReject(
      offer(async (_message, ...actions) => actions[0], 'A message with a step', {
        label: 'Step',
        run: async () => {
          ran = true;
          throw new Error('The keyring is locked.');
        },
      }),
    );
    assert.equal(ran, true);
  });

  test('says so when a job cannot start, e.g. without a keyring, instead of rejecting', async () => {
    const api = await activateExtension();
    const log = vscode.window.createOutputChannel('edu-sharing i18n (feedback tests)', { log: true });
    const ai = {
      client: async () => {
        throw new Error('The keyring is locked.');
      },
    } as unknown as AiService;
    const posted: unknown[] = [];
    const jobs = new AiJobs(
      { folder: 'file:///nowhere', bundleId: 'none' },
      { ai, consent: api.ai.consent, index: api.index, fileStore: api.fileStore, prompts: answering(), log },
      async (message) => void posted.push(message),
    );
    try {
      await assert.doesNotReject(jobs.run(FILL));
      assert.deepEqual(posted, []);
    } finally {
      log.dispose();
    }
  });
});
