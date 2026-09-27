import { describe, expect, it } from 'vitest';
import { AiError } from '../../../../src/core/ai/aiErrors';
import { aiAvailability, chatModels, testConnection } from '../../../../src/core/ai/connection';
import type { ClientOptions } from '../../../../src/core/ai/bapiClient';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(...responses: Response[]) {
  const bodies: unknown[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    if (init.body) {
      bodies.push(JSON.parse(String(init.body)));
    }
    return responses.shift() ?? json(500, {});
  }) as unknown as typeof globalThis.fetch;
  const options: ClientOptions = {
    baseUrl: 'https://b-api.example',
    provider: 'openai',
    key: 'unit-test-key',
    timeoutMs: 1000,
    fetch,
    sleep: async () => undefined,
  };
  return { options, bodies };
}

describe('aiAvailability', () => {
  const baseUrl = 'https://b-api.staging.openeduhub.net';

  it('is available when turned on, in a trusted workspace, with an address and a key', () => {
    expect(aiAvailability({ enabled: true, trusted: true, baseUrl, keySource: 'secret' })).toEqual({
      available: true,
    });
    expect(aiAvailability({ enabled: true, trusted: true, baseUrl, keySource: 'env' })).toEqual({
      available: true,
    });
  });

  it('says the first reason why not: turned off, Restricted Mode, no address it may use, no key', () => {
    expect(aiAvailability({ enabled: false, trusted: false, baseUrl: undefined, keySource: 'none' })).toEqual(
      {
        available: false,
        reason: 'disabled',
      },
    );
    expect(aiAvailability({ enabled: true, trusted: false, baseUrl, keySource: 'secret' })).toEqual({
      available: false,
      reason: 'untrusted',
    });
    expect(aiAvailability({ enabled: true, trusted: true, baseUrl: undefined, keySource: 'none' })).toEqual({
      available: false,
      reason: 'address',
    });
    expect(aiAvailability({ enabled: true, trusted: true, baseUrl, keySource: 'none' })).toEqual({
      available: false,
      reason: 'no-key',
    });
  });
});

describe('chatModels', () => {
  it('keeps the models that chat, and leaves out embeddings, speech, images, moderation and search', () => {
    expect(
      chatModels([
        'gpt-6-luna',
        'text-embedding-ada-002',
        'whisper-1',
        'gpt-4o-mini-tts-2025-03-20',
        'gpt-4o-transcribe',
        'gpt-realtime-mini',
        'gpt-audio-1.5',
        'gpt-image-1-mini',
        'chatgpt-image-latest',
        'omni-moderation-latest',
        'sora-2',
        'gpt-4o-search-preview',
        'computer-use-preview-2025-03-11',
        'o3-deep-research',
        'gpt-4.1',
        'o4-mini',
        'qwen3.6-35b-a3b',
      ]),
    ).toEqual(['gpt-6-luna', 'gpt-4.1', 'o4-mini', 'qwen3.6-35b-a3b']);
  });
});

describe('testConnection', () => {
  it('lists the models, and asks the configured model for a tiny JSON answer with the configured effort', async () => {
    const { options, bodies } = client(
      json(200, { data: [{ id: 'gpt-4.1' }, { id: 'gpt-6-luna' }, { id: 'whisper-1' }] }),
      json(200, { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }),
    );
    let clock = 1000;
    const result = await testConnection(
      options,
      { model: 'gpt-6-luna', effort: 'low' },
      () => (clock += 350),
    );
    expect(result).toEqual({ modelFound: true, chatModels: 2, durationMs: 350 });
    expect(bodies).toEqual([
      expect.objectContaining({
        model: 'gpt-6-luna',
        reasoning_effort: 'low',
        response_format: expect.objectContaining({ type: 'json_schema' }),
      }),
    ]);
  });

  it('sends nothing to a model the b-api does not offer', async () => {
    const { options, bodies } = client(json(200, { data: [{ id: 'gpt-4.1' }] }));
    expect(await testConnection(options, { model: 'gpt-6-luna', effort: 'low' })).toEqual({
      modelFound: false,
      chatModels: 1,
    });
    expect(bodies).toEqual([]);
  });

  it('fails like the client, and with invalid-response when the answer is not the JSON asked for', async () => {
    await expect(
      testConnection(client(json(401, {})).options, { model: 'gpt-6-luna', effort: 'low' }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    const wrong = client(
      json(200, { data: [{ id: 'gpt-6-luna' }] }),
      json(200, { choices: [{ message: { content: 'OK!' }, finish_reason: 'stop' }] }),
    );
    const error = await testConnection(wrong.options, { model: 'gpt-6-luna', effort: 'low' }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: 'invalid-response' });
  });
});
