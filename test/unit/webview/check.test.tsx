// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiJobItem } from '../../../src/shared/aiProtocol';
import type { WebviewToHost } from '../../../src/shared/protocol';
import { axeProblems, openWith as open } from './support';

const id = (key: string) => JSON.stringify(key.split('.'));
const found = (
  key: string,
  source: string,
  before: string,
  text: string,
  severity: 'error' | 'warning' | 'info',
  message: string,
): AiJobItem => ({ entryId: id(key), source, before, text, problem: { severity, message } });
const list = () => screen.getByRole('region', { name: /^KI-Prüfung von fr/ });
const inList = () => within(list());
const box = (key: string) =>
  inList().getByRole('checkbox', { name: `${key} übernehmen` }) as HTMLInputElement;
const posted = (messages: readonly WebviewToHost[], type: WebviewToHost['type']) =>
  messages.filter((message) => message.type === type);

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
});
afterEach(cleanup);

/** An editor with the AI ready and a check of French running, which found two problems in nine texts so far. */
function checking() {
  const editor = open();
  editor.send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
  editor.send({ type: 'aiJob', jobId: 'check-1', kind: 'check', locale: 'fr', source: 'de', total: 9 });
  editor.send({
    type: 'aiJobItems',
    jobId: 'check-1',
    done: 9,
    total: 9,
    items: [
      found(
        'ERROR_TITLE',
        'Fehler ({{date}})',
        'Erreur ({{data}})',
        'Erreur ({{date}})',
        'error',
        'Der Platzhalter {{date}} heißt hier {{data}}.',
      ),
      found('SAVE', 'Speichern', 'Enregistrer', 'Enregistrer', 'info', 'Üblich ist hier „Sauvegarder“.'),
    ],
  });
  return editor;
}

describe('checking with AI', () => {
  it('starts from the toolbar, beside the fill', () => {
    const { send, posted: messages } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Mit KI prüfen…' })));
    expect(posted(messages, 'aiCheck')).toEqual([{ type: 'aiCheck' }]);
  });

  it('lists what it found, chosen none: the problem, the text checked, and the correction to edit', async () => {
    checking();
    expect(document.activeElement).toBe(inList().getByRole('heading', { level: 2 }));
    expect(box('ERROR_TITLE').checked).toBe(false);
    const entry = box('ERROR_TITLE').closest('li')!;
    expect(entry.textContent).toContain('Fehler: Der Platzhalter {{date}} heißt hier {{data}}.');
    expect(entry.textContent).toContain('Bisheriger Text: Erreur ({{data}})');
    expect((inList().getByRole('textbox', { name: 'ERROR_TITLE in fr' }) as HTMLTextAreaElement).value).toBe(
      'Erreur ({{date}})',
    );
    expect(box('SAVE').closest('li')!.textContent).toContain('Hinweis: Üblich ist hier „Sauvegarder“.');
    expect(
      inList().getByRole('button', { name: 'Ausgewählte übernehmen (0)' }).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(await axeProblems()).toEqual([]);
  });

  it('offers no choice for a finding without a correction until the text is edited', () => {
    checking();
    expect(box('SAVE').disabled).toBe(true);
    expect(box('SAVE').closest('li')!.textContent).toContain('Keine Korrektur; bearbeiten Sie den Text');
    act(() => void fireEvent.click(box('SAVE')));
    expect(box('SAVE').checked).toBe(false);
    const field = inList().getByRole('textbox', { name: 'SAVE in fr' });
    act(() => void fireEvent.input(field, { target: { value: 'Sauvegarder' } }));
    expect(box('SAVE').disabled).toBe(false);
    act(() => void fireEvent.click(box('SAVE')));
    expect(box('SAVE').checked).toBe(true);
    // Back to the text as it was: nothing to write, no longer chosen.
    act(() => void fireEvent.input(field, { target: { value: 'Enregistrer' } }));
    expect(box('SAVE').checked).toBe(false);
  });

  it('writes the chosen corrections against the texts it checked, and sums up what it checked', () => {
    const { send, posted: messages, store } = checking();
    send({ type: 'aiJobEnd', jobId: 'check-1', status: 'done', missing: 0 });
    expect(inList().getByRole('status').textContent).toBe(
      'Fertig. Geprüft: 9 · in Ordnung: 7 · Hinweise: 2.',
    );
    act(() => void fireEvent.click(box('ERROR_TITLE')));
    act(() => void fireEvent.click(inList().getByRole('button', { name: 'Ausgewählte übernehmen (1)' })));
    const [apply] = posted(messages, 'aiApply') as Extract<WebviewToHost, { type: 'aiApply' }>[];
    expect(apply).toEqual({
      type: 'aiApply',
      requestId: expect.any(String),
      jobId: 'check-1',
      items: [{ entryId: id('ERROR_TITLE'), value: 'Erreur ({{date}})', before: 'Erreur ({{data}})' }],
    });
    send({ type: 'aiApplyResult', requestId: apply!.requestId, written: [id('ERROR_TITLE')], skipped: [] });
    expect(store.announcement.value.text).toBe('Texte gespeichert: 1.');
    // The other finding stays until the list is closed.
    expect(box('SAVE')).toBeTruthy();
    act(() => void fireEvent.click(inList().getByRole('button', { name: 'Verwerfen' })));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mit KI prüfen…' }));
  });

  it('sums up what a cancelled check found in the texts it checked', () => {
    const { send } = checking();
    // Of nine texts, seven were answered before the cancel: two with a note, five fine.
    send({ type: 'aiJobEnd', jobId: 'check-1', status: 'cancelled', missing: 2 });
    expect(inList().getByRole('status').textContent).toBe(
      'Abgebrochen. Geprüft: 7 · in Ordnung: 5 · Hinweise: 2.',
    );
  });

  it('counts the texts without an answer, and says so when nothing is to be done', () => {
    const { send } = open();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    send({ type: 'aiJob', jobId: 'check-2', kind: 'check', locale: 'fr', source: 'de', total: 9 });
    expect(inList().getByRole('status').textContent).toBe('Geprüft: 0 von 9 …');
    send({ type: 'aiJobItems', jobId: 'check-2', done: 9, total: 9, items: [] });
    send({ type: 'aiJobEnd', jobId: 'check-2', status: 'done', missing: 2 });
    expect(inList().getByRole('status').textContent).toBe(
      'Fertig. Geprüft: 7 · in Ordnung: 7 · Hinweise: 0 · ohne Antwort: 2.',
    );
    expect(inList().getByRole('button', { name: 'Schließen' })).toBeTruthy();
  });
});
