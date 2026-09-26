import type { ReasoningEffort } from '../config/aiSettings';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** The JSON schema an answer must follow; strict, so that every field comes and no other. */
export interface AnswerFormat {
  name: string;
  schema: Readonly<Record<string, unknown>>;
}

export interface CompletionRequest {
  model: string;
  messages: readonly ChatMessage[];
  format: AnswerFormat;
  effort: ReasoningEffort;
  /** For the answer and, with reasoning models, the reasoning before it. */
  maxTokens: number;
}

/**
 * Models that reason before they answer: GPT-5 and 6 and the o-series (o1, o3, o4 …). The b-api refuses
 * `max_tokens` and a `temperature` other than 1 for them (HTTP 400, measured on 24.09.2026). "o" alone is not
 * enough: `openai-gpt-oss-120b` is none.
 */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|gpt-6|o\d)/.test(model);
}

/**
 * The body of a chat completion for the model's profile (design §6.8), so that a change of model needs no change of
 * code. Qwen3 models would think first, which takes most of the budget and is 7 to 9 times slower; the chat template
 * of Mistral models takes no such argument.
 */
export function completionBody(request: CompletionRequest): Record<string, unknown> {
  const { model, messages, format, effort, maxTokens } = request;
  const common = {
    model,
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: { name: format.name, strict: true, schema: format.schema },
    },
  };
  if (isReasoningModel(model)) {
    return { ...common, max_completion_tokens: maxTokens, reasoning_effort: effort };
  }
  return {
    ...common,
    max_tokens: maxTokens,
    temperature: 0,
    ...(model.startsWith('qwen3') ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  };
}

/** Tokens a reasoning model may spend on reasoning, per effort; the answer comes on top. */
const REASONING_TOKENS: Readonly<Record<ReasoningEffort, number>> = {
  none: 0,
  low: 1000,
  medium: 3000,
  high: 8000,
  xhigh: 16000,
};
const MIN_TOKENS = 1000;
const MAX_TOKENS = 32000;

/**
 * The token budget of a request whose texts have `sourceCharacters`: about a token per two characters for the
 * answer in JSON (a token is three to four characters of text), a base for the rest of the JSON, and the reasoning.
 * A budget that is too small ends with `finish_reason: length`; the job then splits the request.
 */
export function tokenBudget(sourceCharacters: number, effort: ReasoningEffort): number {
  const tokens = MIN_TOKENS + Math.ceil(sourceCharacters / 2) + REASONING_TOKENS[effort];
  return Math.min(MAX_TOKENS, Math.max(MIN_TOKENS, tokens));
}
