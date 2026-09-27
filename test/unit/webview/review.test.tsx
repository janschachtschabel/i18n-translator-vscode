// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiJobItem } from '../../../src/shared/aiProtocol';
import type { WebviewToHost } from '../../../src/shared/protocol';
import { axeProblems, openWith as open } from './support';

const id = (key: string) => JSON.stringify(key.split('.'));
const item = (key: string, source: string, text: string, before: string | null = null): AiJobItem => ({
  entryId: id(key),
  source,
  before,
  text,
});
const review = () => screen.getByRole('region', { name: /^KI-Vorschläge für fr/ });
const inReview = () => within(review());
const posted = (messages: readonly WebviewToHost[], type: WebviewToHost['type']) =>
  messages.filter((message) => message.type === type);

beforeEach(() => {
  document.documentElement.lang = 'de';
  document.title = 'common';
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
});
afterEach(cleanup);

/** An editor with the AI ready and a fill of French running, which has sent two suggestions. */
function filling() {
  const editor = open();
  editor.send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
  editor.send({ type: 'aiJob', jobId: 'fill-1', kind: 'fill', locale: 'fr', source: 'de', total: 3 });
  editor.send({
    type: 'aiJobItems',
    jobId: 'fill-1',
    done: 2,
    total: 3,
    items: [
      item('CANCEL', 'Abbrechen', 'Annuler'),
      item('ERROR_TITLE', 'Fehler ({{date}})', 'Erreur : {{data}}', 'Erreur ({{data}})'),
    ],
  });
  return editor;
}

describe('filling with AI', () => {
  it('starts from the toolbar while the AI can be used, which says so; without a key it leads to setting one', () => {
    const { send, posted: messages } = open();
    const ai = () => screen.queryByRole('group', { name: 'KI' });
    expect(ai()).toBeNull();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    expect(ai()!.textContent).toContain('bereit · gpt-6-luna');
    act(() => void fireEvent.click(within(ai()!).getByRole('button', { name: 'Mit KI füllen…' })));
    expect(posted(messages, 'aiFill')).toEqual([{ type: 'aiFill' }]);

    send({ type: 'aiState', available: false, reason: 'no-key', model: 'gpt-6-luna' });
    expect(ai()!.textContent).toContain('kein API-Schlüssel');
    expect(within(ai()!).queryByRole('button', { name: 'Mit KI füllen…' })).toBeNull();
    act(() => void fireEvent.click(within(ai()!).getByRole('button', { name: 'API-Schlüssel setzen…' })));
    expect(posted(messages, 'aiSetup')).toEqual([{ type: 'aiSetup' }]);

    // Off, or in Restricted Mode: nothing of the AI.
    send({ type: 'aiState', available: false, reason: 'untrusted', model: 'gpt-6-luna' });
    expect(ai()).toBeNull();
  });

  it('gives the focus to the fill when the key is set from the button that had it, and leaves it elsewhere', () => {
    const { send } = open();
    const ai = () => screen.getByRole('group', { name: 'KI' });
    send({ type: 'aiState', available: false, reason: 'no-key', model: 'gpt-6-luna' });
    const setKey = within(ai()).getByRole('button', { name: 'API-Schlüssel setzen…' });
    setKey.focus();
    act(() => void fireEvent.click(setKey));
    // The key is set: the button goes, and with it the focus it had.
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    expect(document.activeElement).toBe(within(ai()).getByRole('button', { name: 'Mit KI füllen…' }));

    // A focus elsewhere stays where it is.
    send({ type: 'aiState', available: false, reason: 'no-key', model: 'gpt-6-luna' });
    const undo = screen.getByRole('button', { name: 'Letzte Änderung rückgängig machen' });
    undo.focus();
    send({ type: 'aiState', available: true, model: 'gpt-6-luna' });
    expect(document.activeElement).toBe(undo);
  });

  it('leads to the setup of the AI from the toolbar: the address of the b-api, the key, the model', () => {
    const { send, posted: messages } = open();
    const ai = () => screen.queryByRole('group', { name: 'KI' });
    for (const state of [
      { available: true, model: 'gpt-6-luna' },
      { available: false, reason: 'no-key' as const, model: 'gpt-6-luna' },
    ]) {
      send({ type: 'aiState', ...state });
      act(() => void fireEvent.click(within(ai()!).getByRole('button', { name: 'KI einrichten…' })));
    }
    expect(posted(messages, 'aiConfigure')).toEqual([{ type: 'aiConfigure' }, { type: 'aiConfigure' }]);

    // An address the AI may not use turns it off: the toolbar says so, and leads to the setup.
    send({ type: 'aiState', available: false, reason: 'address', model: 'gpt-6-luna' });
    expect(ai()!.textContent).toContain('Adresse der b-api ungültig');
    expect(within(ai()!).queryByRole('button', { name: 'Mit KI füllen…' })).toBeNull();
    expect(within(ai()!).getByRole('button', { name: 'KI einrichten…' })).toBeTruthy();
  });

  it('chooses all suggestions that have something to write, or none', () => {
    const { send } = filling();
    send({
      type: 'aiJobItems',
      jobId: 'fill-1',
      done: 3,
      total: 3,
      items: [item('SAVE', 'Speichern', ' ', '')],
    });
    const all = () => inReview().getByRole('button', { name: 'Alle auswählen' });
    const none = () => inReview().getByRole('button', { name: 'Keine auswählen' });
    const chosen = () =>
      (inReview().getAllByRole('checkbox') as HTMLInputElement[]).filter((box) => box.checked).length;
    expect(chosen()).toBe(1);
    all().focus();
    act(() => void fireEvent.click(all()));
    // The empty suggestion has nothing to write.
    expect(chosen()).toBe(2);
    // Unavailable now, but it keeps the focus it had: a disabled button would lose it.
    expect([all().hasAttribute('disabled'), all().getAttribute('aria-disabled')]).toEqual([false, 'true']);
    expect(document.activeElement).toBe(all());
    act(() => void fireEvent.click(none()));
    expect(chosen()).toBe(0);
    expect(none().getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps a text chosen by hand when choosing all, and offers all until every text to write is chosen', () => {
    const { send } = filling();
    send({
      type: 'aiJobItems',
      jobId: 'fill-1',
      done: 3,
      total: 3,
      items: [item('SAVE', 'Speichern', ' ', '')],
    });
    const all = () => inReview().getByRole('button', { name: 'Alle auswählen' });
    const box = (key: string) =>
      inReview().getByRole('checkbox', { name: `${key} übernehmen` }) as HTMLInputElement;
    // The empty text by hand: as many chosen as there are texts to write, yet ERROR_TITLE is not.
    act(() => void fireEvent.click(box('SAVE')));
    expect(all().getAttribute('aria-disabled')).toBe('false');
    act(() => void fireEvent.click(all()));
    expect(['CANCEL', 'ERROR_TITLE', 'SAVE'].map((key) => box(key).checked)).toEqual([true, true, true]);
    expect(all().getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the focus in the list when its job ends and takes Cancel with it', () => {
    const { send } = filling();
    const cancel = inReview().getByRole('button', { name: 'Abbrechen' });
    cancel.focus();
    act(() => void fireEvent.click(cancel));
    send({ type: 'aiJobEnd', jobId: 'fill-1', status: 'cancelled', missing: 1 });
    expect(inReview().queryByRole('button', { name: 'Abbrechen' })).toBeNull();
    expect(document.activeElement).toBe(inReview().getByRole('heading', { level: 2 }));
  });

  it('shows the suggestions in place of the table as they come, with progress, and cancels', () => {
    const { send, posted: messages } = filling();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(document.activeElement).toBe(inReview().getByRole('heading', { level: 2 }));
    expect(inReview().getByRole('status').textContent).toBe('Übersetzt: 2 von 3 …');
    expect(inReview().getByRole('progressbar').getAttribute('value')).toBe('2');
    const field = inReview().getByRole('textbox', { name: 'CANCEL in fr' }) as HTMLTextAreaElement;
    expect(field.value).toBe('Annuler');
    expect(inReview().getByText('Abbrechen', { selector: '.review-source span' })).toBeTruthy();
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Abbrechen' })));
    expect(posted(messages, 'aiCancel')).toEqual([{ type: 'aiCancel', requestId: 'fill-1' }]);

    // The suggestions that came stay; the job is over.
    send({ type: 'aiJobEnd', jobId: 'fill-1', status: 'cancelled', missing: 1 });
    expect(inReview().getByRole('status').textContent).toBe('Abgebrochen. Vorschläge: 2.');
    expect(inReview().queryByRole('progressbar')).toBeNull();
    expect(inReview().queryByRole('button', { name: 'Abbrechen' })).toBeNull();
    expect(inReview().getAllByRole('textbox')).toHaveLength(2);
  });

  it('chooses the suggestions without errors; one with wrong placeholders says why and is left out', async () => {
    const { send } = filling();
    expect(
      (inReview().getByRole('checkbox', { name: 'CANCEL übernehmen' }) as HTMLInputElement).checked,
    ).toBe(true);
    const wrong = inReview().getByRole('checkbox', { name: 'ERROR_TITLE übernehmen' }) as HTMLInputElement;
    expect(wrong.checked).toBe(false);
    expect(wrong.closest('li')!.textContent).toContain('Fehlende Platzhalter: {{date}}');
    expect(inReview().getByRole('button', { name: 'Ausgewählte übernehmen (1)' })).toBeTruthy();
    expect(await axeProblems()).toEqual([]);

    // An empty suggestion would delete the text: left out, with the reason.
    send({
      type: 'aiJobItems',
      jobId: 'fill-1',
      done: 3,
      total: 3,
      items: [item('SAVE', 'Speichern', ' ', '')],
    });
    const empty = inReview().getByRole('checkbox', { name: 'SAVE übernehmen' }) as HTMLInputElement;
    expect(empty.checked).toBe(false);
    expect(empty.closest('li')!.textContent).toContain('Der Vorschlag ist leer; er wird nicht geschrieben.');
    // Chunks that repeat a text do not repeat its entry.
    send({
      type: 'aiJobItems',
      jobId: 'fill-1',
      done: 3,
      total: 3,
      items: [item('CANCEL', 'Abbrechen', 'Autre')],
    });
    expect(inReview().getAllByRole('textbox', { name: 'CANCEL in fr' })).toHaveLength(1);
  });

  it('writes the chosen texts as edited; the written ones go, a skipped one stays with its reason', () => {
    const { send, posted: messages } = filling();
    const field = inReview().getByRole('textbox', { name: 'ERROR_TITLE in fr' });
    act(() => void fireEvent.input(field, { target: { value: 'Erreur ({{date}})' } }));
    expect(
      (inReview().getByRole('checkbox', { name: 'ERROR_TITLE übernehmen' }) as HTMLInputElement).checked,
    ).toBe(false);
    act(() => void fireEvent.click(inReview().getByRole('checkbox', { name: 'ERROR_TITLE übernehmen' })));
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Ausgewählte übernehmen (2)' })));
    const [apply] = posted(messages, 'aiApply') as Extract<WebviewToHost, { type: 'aiApply' }>[];
    expect(apply).toEqual({
      type: 'aiApply',
      requestId: expect.any(String),
      jobId: 'fill-1',
      items: [
        { entryId: id('CANCEL'), value: 'Annuler', before: null },
        { entryId: id('ERROR_TITLE'), value: 'Erreur ({{date}})', before: 'Erreur ({{data}})' },
      ],
    });
    send({
      type: 'aiApplyResult',
      requestId: apply!.requestId,
      written: [id('CANCEL')],
      skipped: [{ entryId: id('ERROR_TITLE'), message: 'ERROR_TITLE in fr wurde inzwischen geändert.' }],
    });
    expect(inReview().queryByRole('textbox', { name: 'CANCEL in fr' })).toBeNull();
    const skipped = inReview().getByRole('checkbox', { name: 'ERROR_TITLE übernehmen' }) as HTMLInputElement;
    expect(skipped.checked).toBe(false);
    expect(skipped.closest('li')!.textContent).toContain(
      'Nicht gespeichert: ERROR_TITLE in fr wurde inzwischen geändert.',
    );
  });

  it('closes when everything is written, says so, and shows the table again', () => {
    const { send, posted: messages, store } = filling();
    send({ type: 'aiJobEnd', jobId: 'fill-1', status: 'done', missing: 1 });
    expect(inReview().getByRole('status').textContent).toBe('Fertig. Vorschläge: 2, ohne Antwort: 1.');
    act(() => void fireEvent.click(inReview().getByRole('checkbox', { name: 'ERROR_TITLE übernehmen' })));
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Ausgewählte übernehmen (2)' })));
    const [apply] = posted(messages, 'aiApply') as Extract<WebviewToHost, { type: 'aiApply' }>[];
    send({
      type: 'aiApplyResult',
      requestId: apply!.requestId,
      written: [id('CANCEL'), id('ERROR_TITLE')],
      skipped: [],
    });
    expect(screen.queryByRole('region', { name: /^KI-Vorschläge/ })).toBeNull();
    expect(screen.getByRole('grid')).toBeTruthy();
    expect(store.announcement.value.text).toBe('Texte gespeichert: 2.');
    // The focus was in the list: back to where the fill began.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mit KI füllen…' }));
  });

  it('hands the focus back to where the fill began when the list closes, also with the focus lost', () => {
    const { send, posted: messages } = filling();
    send({ type: 'aiJobEnd', jobId: 'fill-1', status: 'done', missing: 1 });
    act(() => void fireEvent.click(inReview().getByRole('checkbox', { name: 'ERROR_TITLE übernehmen' })));
    const apply = inReview().getByRole('button', { name: 'Ausgewählte übernehmen (2)' });
    apply.focus();
    act(() => void fireEvent.click(apply));
    expect(document.activeElement).toBe(apply);
    // Lost meanwhile, as when a focused button becomes disabled or the element that had it goes away.
    const elsewhere = document.body.appendChild(document.createElement('button'));
    elsewhere.focus();
    elsewhere.remove();
    expect(document.activeElement).toBe(document.body);
    const [request] = posted(messages, 'aiApply') as Extract<WebviewToHost, { type: 'aiApply' }>[];
    send({
      type: 'aiApplyResult',
      requestId: request!.requestId,
      written: [id('CANCEL'), id('ERROR_TITLE')],
      skipped: [],
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mit KI füllen…' }));
  });

  it('keeps a focused field below the head of the list: the page leaves room for the head', () => {
    filling();
    const size = () => document.documentElement.style.getPropertyValue('--review-head-size');
    expect(size()).toMatch(/^\d+px$/);
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Verwerfen' })));
    expect(size()).toBe('');
  });

  it('holds the list still while its write is on its way: what was sent is what is written', () => {
    const { send, posted: messages, store } = filling();
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Ausgewählte übernehmen (1)' })));
    const items = () => screen.getByRole('region', { name: /^KI-Vorschläge/ }).querySelector('ol')!;
    const discard = () => inReview().getByRole('button', { name: 'Verwerfen' });
    expect(items().inert).toBe(true);
    expect(discard().getAttribute('aria-disabled')).toBe('true');
    act(() => void fireEvent.click(discard()));
    expect(screen.queryByRole('region', { name: /^KI-Vorschläge/ })).not.toBeNull();
    const [apply] = posted(messages, 'aiApply') as Extract<WebviewToHost, { type: 'aiApply' }>[];
    send({ type: 'aiApplyResult', requestId: apply!.requestId, written: [id('CANCEL')], skipped: [] });
    expect(store.announcement.value.text).toBe('Texte gespeichert: 1.');
    expect(items().inert).toBe(false);
    expect(discard().getAttribute('aria-disabled')).toBe('false');
  });

  it('keeps the list while its job runs, and says which texts were not saved', () => {
    const { send, posted: messages, store } = filling();
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Ausgewählte übernehmen (1)' })));
    const [apply] = posted(messages, 'aiApply') as Extract<WebviewToHost, { type: 'aiApply' }>[];
    // While the write is on its way, it is not sent twice; the button keeps the focus (not disabled).
    const applying = inReview().getByRole('button', { name: 'Ausgewählte übernehmen (1)' });
    expect([applying.hasAttribute('disabled'), applying.getAttribute('aria-disabled')]).toEqual([
      false,
      'true',
    ]);
    act(() => void fireEvent.click(applying));
    expect(posted(messages, 'aiApply')).toHaveLength(1);
    send({ type: 'aiApplyResult', requestId: apply!.requestId, written: [id('CANCEL')], skipped: [] });
    expect(store.announcement.value.text).toBe('Texte gespeichert: 1.');
    send({ type: 'aiJobEnd', jobId: 'fill-1', status: 'done', missing: 0 });
    act(() => void fireEvent.click(inReview().getByRole('checkbox', { name: 'ERROR_TITLE übernehmen' })));
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Ausgewählte übernehmen (1)' })));
    const [, second] = posted(messages, 'aiApply') as Extract<WebviewToHost, { type: 'aiApply' }>[];
    send({
      type: 'aiApplyResult',
      requestId: second!.requestId,
      written: [],
      skipped: [{ entryId: id('ERROR_TITLE'), message: 'Kaputt.' }],
    });
    expect(store.announcement.value.text).toBe('Texte nicht gespeichert: 1; die Liste nennt den Grund.');
    expect(inReview().getByRole('checkbox', { name: 'ERROR_TITLE übernehmen' })).toBeTruthy();
  });

  it('says why a write failed as a whole, and keeps the choice to try again', () => {
    const { send, posted: messages } = filling();
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Ausgewählte übernehmen (1)' })));
    const [apply] = posted(messages, 'aiApply') as Extract<WebviewToHost, { type: 'aiApply' }>[];
    send({
      type: 'aiApplyResult',
      requestId: apply!.requestId,
      written: [],
      skipped: [],
      message: 'fr.json hat ungespeicherte Änderungen.',
    });
    expect(inReview().getByRole('alert').textContent).toContain('fr.json hat ungespeicherte Änderungen.');
    const retry = inReview().getByRole('button', { name: 'Ausgewählte übernehmen (1)' });
    expect(retry.hasAttribute('disabled')).toBe(false);
  });

  it('says why a fill failed, and discards the list, cancelling a fill that runs', () => {
    const { send, posted: messages } = filling();
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Verwerfen' })));
    expect(posted(messages, 'aiCancel')).toEqual([{ type: 'aiCancel', requestId: 'fill-1' }]);
    expect(screen.getByRole('grid')).toBeTruthy();

    send({ type: 'aiJob', jobId: 'fill-2', kind: 'fill', locale: 'fr', source: 'de', total: 3 });
    send({
      type: 'aiJobEnd',
      jobId: 'fill-2',
      status: 'failed',
      missing: 3,
      message: 'Die b-api hat den Schlüssel abgelehnt (HTTP 401).',
    });
    expect(inReview().getByRole('status').textContent).toBe(
      'Abgebrochen: Die b-api hat den Schlüssel abgelehnt (HTTP 401).',
    );
    // Without a suggestion, there is nothing to discard.
    expect(inReview().queryByRole('button', { name: 'Verwerfen' })).toBeNull();
    act(() => void fireEvent.click(inReview().getByRole('button', { name: 'Schließen' })));
    expect(screen.getByRole('grid')).toBeTruthy();
  });
});
