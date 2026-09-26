import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiError } from '../../../../src/core/ai/aiErrors';
import { chatCompletion, listModels, type ClientOptions } from '../../../../src/core/ai/bapiClient';

const KEY = 'unit-test-key-0815';
const BODY = { model: 'gpt-6-luna', messages: [] };

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch that answers with `responses` in turn (a Response, an Error to throw, or 'hang' until aborted). */
function fakeFetch(...responses: (Response | Error | 'hang')[]) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? new Error('no answer left');
    if (next === 'hang') {
      return new Promise((_, reject) =>
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('aborted'))),
      );
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const answer = (message: Record<string, unknown>, finish = 'stop') =>
  json(200, {
    choices: [{ message, finish_reason: finish }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      completion_tokens_details: { reasoning_tokens: 5 },
    },
  });

function options(fetch: typeof globalThis.fetch, sleeps: number[] = []): ClientOptions {
  return {
    baseUrl: 'https://b-api.example',
    provider: 'openai',
    key: KEY,
    timeoutMs: 1000,
    fetch,
    sleep: async (ms) => void sleeps.push(ms),
  };
}

/** The error a call ends with; the test fails if it does not fail. */
async function failure(call: Promise<unknown>): Promise<AiError> {
  try {
    await call;
  } catch (error) {
    expect(error).toBeInstanceOf(AiError);
    // No path puts the key into a message or a serialized error.
    expect(String(error)).not.toContain(KEY);
    expect(JSON.stringify(error)).not.toContain(KEY);
    return error as AiError;
  }
  throw new Error('the call did not fail');
}

afterEach(() => vi.useRealTimers());

describe('chatCompletion', () => {
  it('posts the body to the chat endpoint with the key in X-API-KEY, and follows no redirect', async () => {
    const { fetch, calls } = fakeFetch(answer({ content: '{"items":[]}' }));
    const result = await chatCompletion(options(fetch), BODY);
    expect(result).toEqual({
      content: '{"items":[]}',
      usage: { prompt: 10, completion: 20, reasoning: 5, total: 30 },
    });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe('https://b-api.example/api/v1/llm/openai/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'X-API-KEY': KEY });
    expect(JSON.parse(String(init.body))).toEqual(BODY);
  });

  it('reads the answer from the reasoning when the content is empty, as some models answer', async () => {
    const { fetch } = fakeFetch(answer({ content: null, reasoning: '{"items":[1]}' }));
    expect((await chatCompletion(options(fetch), BODY)).content).toBe('{"items":[1]}');
  });

  it('fails with length when the budget ran out, and with invalid-response without an answer', async () => {
    expect(
      (await failure(chatCompletion(options(fakeFetch(answer({ content: '{"it' }, 'length')).fetch), BODY)))
        .code,
    ).toBe('length');
    expect(
      (await failure(chatCompletion(options(fakeFetch(json(200, { choices: [] })).fetch), BODY))).code,
    ).toBe('invalid-response');
    expect(
      (await failure(chatCompletion(options(fakeFetch(new Response('<html>', { status: 200 })).fetch), BODY)))
        .code,
    ).toBe('invalid-response');
  });

  it('does not repeat requests the b-api refused, and keeps the body of the answer out of the error', async () => {
    for (const [status, code] of [
      [400, 'bad-request'],
      [401, 'unauthorized'],
      [403, 'unauthorized'],
      [404, 'model-not-found'],
    ] as const) {
      const { fetch, calls } = fakeFetch(
        json(status, { message: 'body text with details', request_id: 'req-1' }),
      );
      const error = await failure(chatCompletion(options(fetch), BODY));
      expect(error, String(status)).toMatchObject({ code, status, requestId: 'req-1' });
      expect(error.message).not.toContain('body text');
      expect(calls).toHaveLength(1);
    }
  });

  it('repeats a busy or failing gateway after 2.5, 5 and 10 seconds, four times at most', async () => {
    for (const status of [429, 502, 503, 504]) {
      const sleeps: number[] = [];
      const { fetch, calls } = fakeFetch(
        json(status, {}),
        json(status, {}),
        json(status, {}),
        json(status, {}),
      );
      const error = await failure(chatCompletion(options(fetch, sleeps), BODY));
      expect(error, String(status)).toMatchObject({ code: 'unavailable', status });
      expect(calls).toHaveLength(4);
      expect(sleeps).toEqual([2500, 5000, 10000]);
    }
    const sleeps: number[] = [];
    const { fetch } = fakeFetch(json(429, {}), answer({ content: '{}' }));
    expect((await chatCompletion(options(fetch, sleeps), BODY)).content).toBe('{}');
    expect(sleeps).toEqual([2500]);
  });

  it('repeats a request the network lost, and says so when it keeps failing', async () => {
    const lost = () => new TypeError('fetch failed');
    const { fetch, calls } = fakeFetch(lost(), lost(), lost(), lost());
    expect((await failure(chatCompletion(options(fetch), BODY))).code).toBe('network');
    expect(calls).toHaveLength(4);
  });

  it('refuses a redirect, which would carry the key to another address', async () => {
    const { fetch, calls } = fakeFetch(
      new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/' } }),
    );
    expect((await failure(chatCompletion(options(fetch), BODY))).code).toBe('redirect');
    expect(calls).toHaveLength(1);
  });

  it('gives up a request that takes longer than the timeout, without repeating it', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch('hang');
    const call = failure(chatCompletion(options(fetch), BODY));
    await vi.advanceTimersByTimeAsync(1000);
    expect((await call).code).toBe('timeout');
    expect(calls).toHaveLength(1);
  });

  it('stops at once when the caller cancels, also while it waits to repeat', async () => {
    const cancel = new AbortController();
    const { fetch, calls } = fakeFetch('hang');
    const call = failure(chatCompletion(options(fetch), BODY, cancel.signal));
    cancel.abort();
    expect((await call).code).toBe('aborted');
    expect(calls).toHaveLength(1);

    const waiting = new AbortController();
    const retry = fakeFetch(json(429, {}), answer({ content: '{}' }));
    const pausing: ClientOptions = {
      ...options(retry.fetch),
      sleep: (_ms, signal) =>
        new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    };
    const repeated = failure(chatCompletion(pausing, BODY, waiting.signal));
    await Promise.resolve();
    waiting.abort();
    expect((await repeated).code).toBe('aborted');
    expect(retry.calls).toHaveLength(1);
  });
});

describe('listModels', () => {
  it('lists the ids the b-api offers for the provider, sorted', async () => {
    const { fetch, calls } = fakeFetch(
      json(200, { data: [{ id: 'gpt-6-luna' }, { id: 'gpt-4.1' }, { name: 'no id' }] }),
    );
    expect(await listModels(options(fetch))).toEqual(['gpt-4.1', 'gpt-6-luna']);
    expect(calls[0]!.url).toBe('https://b-api.example/api/v1/llm/openai/models');
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.init.headers).toEqual({ 'X-API-KEY': KEY });
  });

  it('fails like a chat request', async () => {
    expect((await failure(listModels(options(fakeFetch(json(401, {})).fetch)))).code).toBe('unauthorized');
    expect((await failure(listModels(options(fakeFetch(json(200, { models: 3 })).fetch)))).code).toBe(
      'invalid-response',
    );
  });
});
