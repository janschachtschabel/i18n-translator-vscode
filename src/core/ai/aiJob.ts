import { AiError } from './aiErrors';
import type { PromptItem } from './prompts';

/** A text of a job: what a request carries about it; for a check, also the translation to check. */
export type JobItem = PromptItem & { text?: string };

export interface ChunkLimits {
  /** Texts per request. */
  batchSize: number;
  /** Characters of the texts and their context per request; a longer text goes alone. */
  maxCharacters: number;
}

/** A chunk answered: its answers by key (a translation, a verdict), with the texts done so far. */
export interface JobProgress<T = string> {
  answers: Map<string, T>;
  /** Texts answered or given up so far. */
  done: number;
  total: number;
}

export interface JobOptions<I extends JobItem = PromptItem, T = string> extends ChunkLimits {
  concurrency: number;
  /** Asks the model about a chunk; its answers by key. Throws an AiError. */
  ask: (chunk: readonly I[], signal: AbortSignal) => Promise<Map<string, T>>;
  onProgress: (progress: JobProgress<T>) => void;
  signal?: AbortSignal;
}

export type JobResult =
  | { status: 'done' | 'cancelled'; missing: string[] }
  | { status: 'failed'; error: AiError; missing: string[] };

/** Cuts items into chunks of at most `batchSize` texts and `maxCharacters` characters, in their order. */
export function chunkItems<I extends JobItem>(
  items: readonly I[],
  { batchSize, maxCharacters }: ChunkLimits,
): I[][] {
  const chunks: I[][] = [];
  let chunk: I[] = [];
  let characters = 0;
  for (const item of items) {
    const size = charactersOf(item);
    if (chunk.length > 0 && (chunk.length >= batchSize || characters + size > maxCharacters)) {
      chunks.push(chunk);
      chunk = [];
      characters = 0;
    }
    chunk.push(item);
    characters += size;
  }
  if (chunk.length > 0) {
    chunks.push(chunk);
  }
  return chunks;
}

/**
 * Asks the model about items in chunks (to translate them, or to check their translations), `concurrency` at a time,
 * and reports each chunk as it is answered. A chunk whose answer the token limit cut off is halved, down to single
 * texts; one the model answered unreadably, and keys an answer left out, end up in `missing`. Any other failure would
 * hit every request (a refused key, an unknown model, the b-api down after its retries): the job stops and aborts
 * what runs, as when it is cancelled. What came before stays reported.
 */
export async function runAiJob<I extends JobItem, T>(
  items: readonly I[],
  options: JobOptions<I, T>,
): Promise<JobResult> {
  const { concurrency, ask, onProgress } = options;
  const queue = chunkItems(items, options);
  const job = new AbortController();
  const cancel = () => job.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const answered = new Set<string>();
  let done = 0;
  let failure: AiError | undefined;

  const report = (chunk: readonly I[], answers: Map<string, T>) => {
    const asked = new Set(chunk.map((item) => item.key));
    const own = new Map([...answers].filter(([key]) => asked.has(key)));
    own.forEach((_, key) => answered.add(key));
    done += chunk.length;
    onProgress({ answers: own, done, total: items.length });
  };
  const run = async (chunk: readonly I[]): Promise<void> => {
    try {
      report(chunk, await ask(chunk, job.signal));
    } catch (error) {
      if (job.signal.aborted) {
        return;
      }
      const code = error instanceof AiError ? error.code : undefined;
      if (code === 'length' && chunk.length > 1) {
        const half = Math.ceil(chunk.length / 2);
        await run(chunk.slice(0, half));
        await run(chunk.slice(half));
      } else if (code === 'length' || code === 'invalid-response') {
        report(chunk, new Map());
      } else {
        failure = error instanceof AiError ? error : new AiError('invalid-response');
        job.abort();
      }
    }
  };
  const worker = async () => {
    for (let chunk = queue.shift(); chunk && !job.signal.aborted; chunk = queue.shift()) {
      await run(chunk);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
  } finally {
    options.signal?.removeEventListener('abort', cancel);
  }
  const missing = items.map((item) => item.key).filter((key) => !answered.has(key));
  if (failure) {
    return { status: 'failed', error: failure, missing };
  }
  return { status: options.signal?.aborted ? 'cancelled' : 'done', missing };
}

function charactersOf(item: JobItem): number {
  return item.source.length + (item.text?.length ?? 0) + Object.values(item.context ?? {}).join('').length;
}
