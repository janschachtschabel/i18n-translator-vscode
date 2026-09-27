import * as assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import type { Prompts } from '../../src/extension/commands/prompts';
import { AiConsent } from '../../src/extension/services/aiConsent';
import { answering } from './helpers';

const GRANTED = 'eduI18n.aiConsent';

/** The global state as far as the consent uses it; `store` is what all windows share. */
function memento(): vscode.Memento & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    keys: () => [...store.keys()],
    get: <T>(key: string, fallback?: T) => (store.has(key) ? (store.get(key) as T) : fallback),
    update: async (key: string, value: unknown) => void store.set(key, value),
  } as vscode.Memento & { store: Map<string, unknown> };
}

/** Consent questions that stay open until `answer` is called. */
function openQuestions() {
  const answers: ((agreed: boolean) => void)[] = [];
  const prompts: Prompts = {
    ...answering(),
    confirm: () => new Promise<boolean>((resolve) => answers.push(resolve)),
  };
  return { prompts, answer: (agreed: boolean) => answers.shift()!(agreed) };
}

suite('AI consent', () => {
  test('keeps both answers when two questions are open at once, e.g. in two editors', async () => {
    const state = memento();
    const consent = new AiConsent(state);
    const questions = openQuestions();
    const first = consent.ensure('a.example', questions.prompts);
    const second = consent.ensure('b.example', questions.prompts);
    questions.answer(true);
    questions.answer(true);
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    // A later session knows only what is stored.
    const later = new AiConsent(state);
    const asked = answering();
    assert.deepEqual(
      [await later.ensure('a.example', asked), await later.ensure('b.example', asked)],
      [true, true],
    );
    assert.deepEqual(asked.asked, []);
  });

  test('holds a consent of this session when another window stores its older list', async () => {
    const state = memento();
    const consent = new AiConsent(state);
    assert.equal(await consent.ensure('a.example', answering(true)), true);
    // Another window, which had not seen that consent yet, stores the list it knows.
    state.store.set(GRANTED, ['b.example']);
    const again = answering();
    assert.equal(await consent.ensure('a.example', again), true);
    assert.deepEqual(again.asked, []);
    // The next consent stores all three.
    assert.equal(await consent.ensure('c.example', answering(true)), true);
    assert.deepEqual([...(state.store.get(GRANTED) as string[])].sort(), [
      'a.example',
      'b.example',
      'c.example',
    ]);
  });
});
