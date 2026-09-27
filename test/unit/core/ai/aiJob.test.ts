import { describe, expect, it } from 'vitest';
import { AiError } from '../../../../src/core/ai/aiErrors';
import type { PromptItem } from '../../../../src/core/ai/prompts';
import { chunkItems, runAiJob, type JobProgress } from '../../../../src/core/ai/aiJob';

const items = (count: number, source = 'text'): PromptItem[] =>
  Array.from({ length: count }, (_, index) => ({ key: `K${index}`, source: `${source} ${index}` }));
const upper = (chunk: readonly PromptItem[]) =>
  new Map(chunk.map((item) => [item.key, item.source.toUpperCase()]));

describe('chunkItems', () => {
  it('cuts the items into chunks of at most the batch size and the character budget', () => {
    expect(
      chunkItems(items(60), { batchSize: 25, maxCharacters: 100_000 }).map((chunk) => chunk.length),
    ).toEqual([25, 25, 10]);
    const long = [
      { key: 'A', source: 'a'.repeat(60) },
      { key: 'B', source: 'b'.repeat(30), context: { en: 'c'.repeat(20) } },
      { key: 'C', source: 'c'.repeat(200) },
      { key: 'D', source: 'd' },
    ];
    // A text over the budget goes alone; the context counts.
    expect(
      chunkItems(long, { batchSize: 25, maxCharacters: 100 }).map((chunk) => chunk.map((item) => item.key)),
    ).toEqual([['A'], ['B'], ['C'], ['D']]);
  });
});

describe('runAiJob', () => {
  it('translates every chunk, reports each as it comes, and ends done', async () => {
    const progress: JobProgress[] = [];
    const result = await runAiJob(items(5), {
      batchSize: 2,
      maxCharacters: 1000,
      concurrency: 2,
      ask: async (chunk) => upper(chunk),
      onProgress: (step) => progress.push(step),
    });
    expect(result).toEqual({ status: 'done', missing: [] });
    expect(progress.map(({ done, total }) => [done, total])).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ]);
    expect(new Map(progress.flatMap(({ answers }) => [...answers]))).toEqual(upper(items(5)));
  });

  it('runs no more requests at once than allowed', async () => {
    let running = 0;
    let most = 0;
    await runAiJob(items(12), {
      batchSize: 2,
      maxCharacters: 1000,
      concurrency: 3,
      ask: async (chunk) => {
        running++;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        return upper(chunk);
      },
      onProgress: () => undefined,
    });
    expect(most).toBe(3);
  });

  it('halves a chunk whose answer the token limit cut off, down to single texts, and names what stays without', async () => {
    const sizes: number[] = [];
    const result = await runAiJob(items(4), {
      batchSize: 4,
      maxCharacters: 1000,
      concurrency: 1,
      ask: async (chunk) => {
        sizes.push(chunk.length);
        if (chunk.length > 1 || chunk[0]!.key === 'K3') {
          throw new AiError('length');
        }
        return upper(chunk);
      },
      onProgress: () => undefined,
    });
    expect(sizes).toEqual([4, 2, 1, 1, 2, 1, 1]);
    expect(result).toEqual({ status: 'done', missing: ['K3'] });
  });

  it('names the keys an answer left out, and those of a chunk it could not read', async () => {
    const result = await runAiJob(items(4), {
      batchSize: 2,
      maxCharacters: 1000,
      concurrency: 1,
      ask: async (chunk) => {
        if (chunk[0]!.key === 'K2') {
          throw new AiError('invalid-response');
        }
        return new Map([[chunk[0]!.key, 'only the first']]);
      },
      onProgress: () => undefined,
    });
    expect(result).toEqual({ status: 'done', missing: ['K1', 'K2', 'K3'] });
  });

  it('stops at a failure every request would have, and keeps what came before', async () => {
    const progress: JobProgress[] = [];
    const refused = new AiError('unauthorized', 401);
    const result = await runAiJob(items(6), {
      batchSize: 2,
      maxCharacters: 1000,
      concurrency: 1,
      ask: async (chunk) => {
        if (chunk[0]!.key === 'K2') {
          throw refused;
        }
        return upper(chunk);
      },
      onProgress: (step) => progress.push(step),
    });
    expect(result).toEqual({ status: 'failed', error: refused, missing: ['K2', 'K3', 'K4', 'K5'] });
    expect(progress.map(({ answers }) => [...answers.keys()])).toEqual([['K0', 'K1']]);
  });

  it('stops when cancelled: no new requests, the running one aborted', async () => {
    const cancel = new AbortController();
    const sent: string[] = [];
    const result = await runAiJob(items(6), {
      batchSize: 2,
      maxCharacters: 1000,
      concurrency: 1,
      signal: cancel.signal,
      ask: (chunk, signal) => {
        sent.push(chunk[0]!.key);
        if (chunk[0]!.key === 'K0') {
          return Promise.resolve(upper(chunk));
        }
        // The user cancels while this request runs.
        setTimeout(() => cancel.abort(), 0);
        return new Promise<Map<string, string>>((_, reject) =>
          signal.addEventListener('abort', () => reject(new AiError('aborted'))),
        );
      },
      onProgress: () => undefined,
    });
    expect(result).toEqual({ status: 'cancelled', missing: ['K2', 'K3', 'K4', 'K5'] });
    expect(sent).toEqual(['K0', 'K2']);
  });

  it('sends nothing when cancelled before it starts', async () => {
    const cancel = new AbortController();
    cancel.abort();
    const sent: string[] = [];
    const result = await runAiJob(items(4), {
      batchSize: 2,
      maxCharacters: 1000,
      concurrency: 2,
      signal: cancel.signal,
      ask: async (chunk) => (sent.push(chunk[0]!.key), upper(chunk)),
      onProgress: () => undefined,
    });
    expect(result).toEqual({ status: 'cancelled', missing: ['K0', 'K1', 'K2', 'K3'] });
    expect(sent).toEqual([]);
  });
});
