import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET, MAIL_PRESET, MDS_PRESET } from '../../../../src/core/area/presets';
import { askChunk, itemCharacters, promptFrame } from '../../../../src/core/ai/jobPrompt';
import { tokenBudget } from '../../../../src/core/ai/modelProfiles';
import { TRANSLATIONS_FORMAT } from '../../../../src/core/ai/prompts';
import { DEFAULT_SETTINGS } from '../../../../src/core/config/settings';

const frame = (options: Partial<Parameters<typeof promptFrame>[0]>) =>
  promptFrame({
    format: 'json-nested',
    area: ANGULAR_PRESET,
    settings: DEFAULT_SETTINGS,
    descriptions: {},
    source: 'de',
    target: 'fr',
    ...options,
  });

describe('promptFrame', () => {
  it('describes both languages, the file without a locale by the language it holds', () => {
    expect(
      frame({ source: 'default', target: 'de_DE', descriptions: { de_DE: 'German, formal' } }),
    ).toMatchObject({
      source: { code: 'default', description: 'English' },
      target: { code: 'de_DE', description: 'German, formal' },
    });
  });

  it('takes the target for a variant only when the source is its base', () => {
    expect(frame({ source: 'de', target: 'de-informal' }).variant).toBe(true);
    expect(frame({ source: 'en', target: 'de-informal' }).variant).toBe(false);
    expect(frame({ source: 'de', target: 'fr' }).variant).toBe(false);
  });

  it('names the placeholders of the area and says whether the texts are mails', () => {
    expect(frame({})).toMatchObject({ syntax: 'double-brace', html: false });
    expect(frame({ area: MDS_PRESET, format: 'properties' })).toMatchObject({
      syntax: 'single-brace',
      html: false,
    });
    expect(frame({ area: MAIL_PRESET, format: 'mail-xml' })).toMatchObject({
      syntax: 'double-brace-exact',
      html: true,
    });
  });
});

describe('itemCharacters', () => {
  it('counts the source, the text to check and the context that go to the model', () => {
    expect(itemCharacters({ key: 'k', source: 'Hallo', context: { en: 'Hello', fr: 'Salut' } })).toBe(15);
    expect(itemCharacters({ key: 'k', source: 'Hallo', text: 'Bonjour' })).toBe(12);
  });
});

describe('askChunk', () => {
  it('sends the messages with the model, the answer format and a budget from the characters', async () => {
    let body: Record<string, unknown> = {};
    const fetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"texts":[]}' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof globalThis.fetch;
    const client = {
      baseUrl: 'https://b-api.example',
      provider: 'openai',
      key: 'k',
      timeoutMs: 1000,
      fetch,
    } as const;
    const messages = [{ role: 'user', content: 'Translate' }] as const;
    const low = await askChunk(client, {
      model: 'gpt-6-luna',
      effort: 'low',
      messages,
      format: TRANSLATIONS_FORMAT,
      characters: 100,
    });
    expect(low.content).toBe('{"texts":[]}');
    expect(body).toMatchObject({ model: 'gpt-6-luna', messages });
    const budget = (answer: Record<string, unknown>) =>
      answer['max_completion_tokens'] ?? answer['max_tokens'];
    expect(budget(body)).toBe(tokenBudget(100, 'low'));
    await askChunk(client, {
      model: 'gpt-6-luna',
      effort: 'low',
      messages,
      format: TRANSLATIONS_FORMAT,
      characters: 10_000,
    });
    expect(budget(body)).toBe(tokenBudget(10_000, 'low'));
    expect(tokenBudget(10_000, 'low')).toBeGreaterThan(tokenBudget(100, 'low'));
  });
});
