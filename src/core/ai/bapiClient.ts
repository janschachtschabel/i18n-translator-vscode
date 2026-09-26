import { AiError, type AiErrorCode } from './aiErrors';

export interface ClientOptions {
  /** Without a slash at the end (see `allowedBaseUrl`). */
  baseUrl: string;
  provider: string;
  key: string;
  /** For each request, until its answer is read. */
  timeoutMs: number;
  fetch: typeof globalThis.fetch;
  /** Waits before a request is repeated; rejects when `signal` aborts. The tests pass one that does not wait. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface TokenUsage {
  prompt?: number;
  completion?: number;
  /** Part of `completion`, with reasoning models. */
  reasoning?: number;
  total?: number;
}

export interface Completion {
  content: string;
  usage?: TokenUsage;
}

/**
 * The b-api sends 429 without `retry-after` when too many requests run at once, and 502 to 504 under load: those
 * are repeated after 2.5, 5 and 10 seconds, four attempts in all.
 */
const RETRY_DELAYS = [2500, 5000, 10000];
const RETRIED = new Set([429, 502, 503, 504]);
const MAX_REQUEST_ID_LENGTH = 200;

/** Sends a chat completion and reads its answer; throws an {@link AiError}. */
export async function chatCompletion(
  options: ClientOptions,
  body: Readonly<Record<string, unknown>>,
  signal?: AbortSignal,
): Promise<Completion> {
  const data = await request(
    options,
    'chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': options.key },
      body: JSON.stringify(body),
    },
    signal,
  );
  const choice = Array.isArray(field(data, 'choices')) ? (field(data, 'choices') as unknown[])[0] : undefined;
  if (field(choice, 'finish_reason') === 'length') {
    throw new AiError('length');
  }
  const message = field(choice, 'message');
  // Some models put the answer into `reasoning` and leave `content` empty.
  const content = [field(message, 'content'), field(message, 'reasoning')].find(
    (text): text is string => typeof text === 'string' && text !== '',
  );
  if (content === undefined) {
    throw new AiError('invalid-response');
  }
  const usage = usageOf(field(data, 'usage'));
  return usage ? { content, usage } : { content };
}

/** The ids of the models the b-api offers for the provider, sorted; throws an {@link AiError}. */
export async function listModels(options: ClientOptions, signal?: AbortSignal): Promise<string[]> {
  const data = await request(
    options,
    'models',
    { method: 'GET', headers: { 'X-API-KEY': options.key } },
    signal,
  );
  const models = Array.isArray(data) ? data : field(data, 'data');
  if (!Array.isArray(models)) {
    throw new AiError('invalid-response');
  }
  return models
    .map((model) => field(model, 'id'))
    .filter((id): id is string => typeof id === 'string')
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/** A request with its repetitions; the parsed JSON of the answer. */
async function request(
  options: ClientOptions,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = `${options.baseUrl}/api/v1/llm/${options.provider}/${path}`;
  for (let attempt = 0; ; attempt++) {
    let answer: { status: number; redirected: boolean; text: string };
    try {
      answer = await exchange(options, url, init, signal);
    } catch (error) {
      if (error instanceof AiError) {
        throw error;
      }
      // The network lost the request (fetch rejects with a TypeError): try again like a busy gateway.
      await pause(options, attempt, signal, new AiError('network'));
      continue;
    }
    if (signal?.aborted) {
      throw new AiError('aborted');
    }
    const { status, redirected, text } = answer;
    if (redirected) {
      throw new AiError('redirect', status);
    }
    if (status >= 200 && status < 300) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        // An answer that is no JSON, e.g. a page of a proxy.
        throw new AiError('invalid-response', status);
      }
    }
    const requestId = requestIdOf(text);
    if (RETRIED.has(status)) {
      await pause(options, attempt, signal, new AiError('unavailable', status, requestId));
      continue;
    }
    throw new AiError(codeFor(status), status, requestId);
  }
}

/**
 * One request and its answer, within the timeout. Redirects are not followed: fetch would send the key along to
 * the other address.
 */
async function exchange(
  options: ClientOptions,
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
): Promise<{ status: number; redirected: boolean; text: string }> {
  if (signal?.aborted) {
    throw new AiError('aborted');
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await options.fetch(url, { ...init, redirect: 'manual', signal: controller.signal });
    // A browser answers a redirect with an opaque response of status 0; Node with the 3xx status.
    const redirected =
      response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
    return { status: response.status, redirected, text: redirected ? '' : await response.text() };
  } catch (error) {
    if (timedOut) {
      throw new AiError('timeout');
    }
    if (signal?.aborted) {
      throw new AiError('aborted');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

/**
 * Waits before attempt `attempt + 1`, or throws `failure` after the last one. A cancel before the wait is caught by
 * the caller, which checks the signal after every answer without awaiting anything before the wait.
 */
async function pause(
  options: ClientOptions,
  attempt: number,
  signal: AbortSignal | undefined,
  failure: AiError,
) {
  const delay = RETRY_DELAYS[attempt];
  if (delay === undefined) {
    throw failure;
  }
  try {
    await (options.sleep ?? sleep)(delay, signal);
  } catch {
    // The only reason a wait ends early.
    throw new AiError('aborted');
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AiError('aborted'));
      },
      { once: true },
    );
  });
}

function codeFor(status: number): AiErrorCode {
  if (status === 401 || status === 403) {
    return 'unauthorized';
  }
  if (status === 404) {
    return 'model-not-found';
  }
  return status >= 500 ? 'unavailable' : 'bad-request';
}

/** The request id the b-api puts into an error's body, for a report; the rest of the body stays out. */
function requestIdOf(text: string): string | undefined {
  try {
    const id = field(JSON.parse(text), 'request_id');
    return typeof id === 'string' && id.length <= MAX_REQUEST_ID_LENGTH ? id : undefined;
  } catch {
    // No JSON: no request id.
    return undefined;
  }
}

function usageOf(value: unknown): TokenUsage | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const count = (number: unknown) => (typeof number === 'number' ? number : undefined);
  const usage: TokenUsage = {
    prompt: count(field(value, 'prompt_tokens')),
    completion: count(field(value, 'completion_tokens')),
    reasoning: count(field(field(value, 'completion_tokens_details'), 'reasoning_tokens')),
    total: count(field(value, 'total_tokens')),
  };
  return Object.fromEntries(Object.entries(usage).filter(([, number]) => number !== undefined));
}

/** A field of a parsed JSON value, if it is an object. */
function field(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)[name]
    : undefined;
}
