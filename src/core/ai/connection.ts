import type { ReasoningEffort } from '../config/aiSettings';
import { AiError } from './aiErrors';
import { chatCompletion, listModels, type ClientOptions } from './bapiClient';
import { completionBody, tokenBudget, type AnswerFormat, type ChatMessage } from './modelProfiles';

/** Why the AI cannot be used, in the order the user has to solve it; `address`: none it may use is set. */
export type AiUnavailable = 'disabled' | 'untrusted' | 'address' | 'no-key';

export function aiAvailability(state: {
  enabled: boolean;
  trusted: boolean;
  baseUrl: string | undefined;
  keySource: 'secret' | 'env' | 'none';
}): { available: true } | { available: false; reason: AiUnavailable } {
  if (!state.enabled) {
    return { available: false, reason: 'disabled' };
  }
  if (!state.trusted) {
    return { available: false, reason: 'untrusted' };
  }
  if (state.baseUrl === undefined) {
    return { available: false, reason: 'address' };
  }
  return state.keySource === 'none' ? { available: false, reason: 'no-key' } : { available: true };
}

/** Model families of the b-api that do not chat (the b-api answers them "not a chat model"). */
const NOT_CHAT =
  /embed|whisper|tts|transcri|audio|realtime|image|dall-e|moderation|sora|search|computer-use|deep-research/;

/** The ids of models that can translate, in the given order. */
export function chatModels(ids: readonly string[]): string[] {
  return ids.filter((id) => !NOT_CHAT.test(id));
}

export interface ConnectionResult {
  /** Whether the b-api offers the configured model; without it, no request was sent to it. */
  modelFound: boolean;
  chatModels: number;
  /** How long the model took to answer. */
  durationMs?: number;
}

/** A fixed text: the test sends nothing of the workspace, so it needs no consent. */
const PING: readonly ChatMessage[] = [
  { role: 'system', content: 'This is a connection test. Answer with the JSON object {"ok": true}.' },
  { role: 'user', content: 'ping' },
];
const PING_FORMAT: AnswerFormat = {
  name: 'connection_test',
  schema: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
    additionalProperties: false,
  },
};

/**
 * Tests the connection as the AI functions will use it: lists the models of the provider and, if the configured
 * one is among them, asks it for a tiny answer in a JSON schema with the configured effort. Throws an AiError.
 */
export async function testConnection(
  options: ClientOptions,
  { model, effort }: { model: string; effort: ReasoningEffort },
  now: () => number = Date.now,
  signal?: AbortSignal,
): Promise<ConnectionResult> {
  const models = chatModels(await listModels(options, signal));
  if (!models.includes(model)) {
    return { modelFound: false, chatModels: models.length };
  }
  const started = now();
  const { content } = await chatCompletion(
    options,
    completionBody({ model, messages: PING, format: PING_FORMAT, effort, maxTokens: tokenBudget(0, effort) }),
    signal,
  );
  if (!answersOk(content)) {
    throw new AiError('invalid-response');
  }
  return { modelFound: true, chatModels: models.length, durationMs: now() - started };
}

function answersOk(content: string): boolean {
  try {
    const answer: unknown = JSON.parse(content);
    return typeof answer === 'object' && answer !== null && (answer as { ok?: unknown }).ok === true;
  } catch {
    // Not JSON: the model ignored the schema.
    return false;
  }
}
