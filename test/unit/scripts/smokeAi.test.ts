import { describe, expect, it } from 'vitest';
import { SMOKE_TEXTS, smokeAi } from '../../../scripts/lib/smokeAi';

const KEY = 'smoke-test-key-4711';

/**
 * A b-api that lists the model, translates each text as `fr:<source>`, and finds a problem in the check of every
 * translation that renamed a placeholder; or answers every request with `status`.
 */
function bapi(status = 200) {
  const requests: { path: string; key: string | null }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ path: url.pathname, key: new Headers(init?.headers).get('X-API-KEY') });
    if (status !== 200) {
      return new Response(JSON.stringify({ message: 'refused' }), { status });
    }
    if (url.pathname.endsWith('/models')) {
      return Response.json({ data: [{ id: 'gpt-6-luna' }, { id: 'other-model' }] });
    }
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    const items = (
      JSON.parse(body.messages[1]!.content) as {
        items: { key: string; source: string; translation?: string }[];
      }
    ).items;
    const answer = items.some((item) => item.translation !== undefined)
      ? {
          items: items.map(({ key, source, translation = '' }) =>
            (source.match(/\{\{\w+\}\}/g) ?? []).every((placeholder) => translation.includes(placeholder))
              ? { key, verdict: 'ok', severity: 'info', problem: '', suggestion: '' }
              : {
                  key,
                  verdict: 'problem',
                  severity: 'error',
                  problem: 'A placeholder is renamed.',
                  suggestion: '',
                },
          ),
        }
      : { items: items.map(({ key, source }) => ({ key, text: `fr:${source}` })) };
    return Response.json({
      choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

async function run(env: Record<string, string | undefined>, fetch: typeof globalThis.fetch) {
  const lines: string[] = [];
  const code = await smokeAi(env, fetch, (line) => lines.push(line));
  return { code, output: lines.join('\n') };
}

describe('smokeAi', () => {
  it('sends nothing without EDU_I18N_AI_SMOKE=1, and says how to run it', async () => {
    const { fetch, requests } = bapi();
    const { code, output } = await run({ B_API_KEY: KEY }, fetch);
    expect(code).toBe(0);
    expect(requests).toEqual([]);
    expect(output).toContain('EDU_I18N_AI_SMOKE=1');
  });

  it('fails without a usable key, and sends nothing', async () => {
    const { fetch, requests } = bapi();
    for (const key of [undefined, '', 'with space']) {
      const { code } = await run({ EDU_I18N_AI_SMOKE: '1', B_API_KEY: key }, fetch);
      expect(code).toBe(1);
    }
    expect(requests).toEqual([]);
  });

  it('lists the models, translates and checks synthetic texts, and prints neither the key nor a text', async () => {
    const { fetch, requests } = bapi();
    const { code, output } = await run({ EDU_I18N_AI_SMOKE: '1', B_API_KEY: KEY }, fetch);
    expect(code).toBe(0);
    expect(requests.map((request) => request.path)).toEqual([
      '/api/v1/llm/openai/models',
      '/api/v1/llm/openai/chat/completions',
      '/api/v1/llm/openai/chat/completions',
    ]);
    expect(requests.every((request) => request.key === KEY)).toBe(true);
    expect(output).toMatch(/models: ok, 2 offered, gpt-6-luna among them/);
    expect(output).toMatch(/translation: ok, 3 of 3 answered, placeholders kept in 3 of 3; tokens 120 \+ 30/);
    // The check is given one translation with a renamed placeholder, which it has to find.
    expect(output).toMatch(/check: ok, 3 of 3 answered, findings: error 1; the renamed placeholder found/);
    expect(output).not.toContain(KEY);
    for (const text of SMOKE_TEXTS) {
      expect(output).not.toContain(text);
    }
  });

  it('fails with the reason of a refused key, without the key', async () => {
    const { fetch } = bapi(401);
    const { code, output } = await run({ EDU_I18N_AI_SMOKE: '1', B_API_KEY: KEY }, fetch);
    expect(code).toBe(1);
    expect(output).toMatch(/models: failed, unauthorized \(HTTP 401\)/);
    expect(output).not.toContain(KEY);
  });
});
