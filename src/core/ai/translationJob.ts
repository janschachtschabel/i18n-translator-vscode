import { AiError } from './aiErrors';
import type { PromptItem } from './prompts';

export interface ChunkLimits {
  /** Texts per request. */
  batchSize: number;
  /** Characters of source and context per request; a longer text goes alone. */
  maxCharacters: number;
}

export interface JobProgress {
  /** The texts of the chunk just answered, by key. */
  texts: Map<string, string>;
  /** Texts answered or given up so far. */
  done: number;
  total: number;
}

export interface JobOptions extends ChunkLimits {
  concurrency: number;
  /** Translates a chunk; its texts by key. Throws an AiError. */
  translate: (chunk: readonly PromptItem[], signal: AbortSignal) => Promise<Map<string, string>>;
  onProgress: (progress: JobProgress) => void;
  signal?: AbortSignal;
}

export type JobResult =
  | { status: 'done' | 'cancelled'; missing: string[] }
  | { status: 'failed'; error: AiError; missing: string[] };

/** Cuts items into chunks of at most `batchSize` texts and `maxCharacters` characters, in their order. */
export function chunkItems(
  items: readonly PromptItem[],
  { batchSize, maxCharacters }: ChunkLimits,
): PromptItem[][] {
  const chunks: PromptItem[][] = [];
  let chunk: PromptItem[] = [];
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
 * Translates items in chunks, `concurrency` at a time, and reports each chunk as it is answered. A chunk whose answer
 * the token limit cut off is halved, down to single texts; one the model answered unreadably, and keys an answer left
 * out, end up in `missing`. Any other failure would hit every request (a refused key, an unknown model, the b-api
 * down after its retries): the job stops and aborts what runs, as when it is cancelled. What came before stays
 * reported.
 */
export async function runTranslationJob(
  items: readonly PromptItem[],
  options: JobOptions,
): Promise<JobResult> {
  const { concurrency, translate, onProgress } = options;
  const queue = chunkItems(items, options);
  const job = new AbortController();
  const cancel = () => job.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const answered = new Set<string>();
  let done = 0;
  let failure: AiError | undefined;

  const report = (chunk: readonly PromptItem[], texts: Map<string, string>) => {
    const asked = new Set(chunk.map((item) => item.key));
    const own = new Map([...texts].filter(([key]) => asked.has(key)));
    own.forEach((_, key) => answered.add(key));
    done += chunk.length;
    onProgress({ texts: own, done, total: items.length });
  };
  const run = async (chunk: readonly PromptItem[]): Promise<void> => {
    try {
      report(chunk, await translate(chunk, job.signal));
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

function charactersOf(item: PromptItem): number {
  return item.source.length + Object.values(item.context ?? {}).join('').length;
}
