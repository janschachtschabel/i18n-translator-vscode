import { describe, expect, it } from 'vitest';
import { completionBody, isReasoningModel, tokenBudget } from '../../../../src/core/ai/modelProfiles';

const messages = [
  { role: 'system' as const, content: 'Translate.' },
  { role: 'user' as const, content: '[]' },
];
const format = { name: 'translations', schema: { type: 'object' } };
const body = (model: string) => completionBody({ model, messages, format, effort: 'low', maxTokens: 2000 });

describe('model profiles', () => {
  it('sends reasoning models max_completion_tokens and the effort, never temperature or max_tokens', () => {
    for (const model of ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5-mini', 'o3', 'o4-mini', 'o1-pro']) {
      expect(isReasoningModel(model), model).toBe(true);
      const sent = body(model);
      expect(sent, model).toMatchObject({
        model,
        messages,
        max_completion_tokens: 2000,
        reasoning_effort: 'low',
      });
      expect(sent, model).not.toHaveProperty('temperature');
      expect(sent, model).not.toHaveProperty('max_tokens');
    }
  });

  it('sends other models max_tokens and temperature 0, and turns off the thinking of Qwen3 only', () => {
    // "o*" in the design would take openai-gpt-oss-120b for an o-model; only o and a digit are.
    for (const model of [
      'gpt-4.1',
      'gpt-4o-mini',
      'openai-gpt-oss-120b',
      'mistral-medium-3.5-128b',
      'qwen3.6-35b-a3b',
    ]) {
      expect(isReasoningModel(model), model).toBe(false);
      const sent = body(model);
      expect(sent, model).toMatchObject({ model, max_tokens: 2000, temperature: 0 });
      expect(sent, model).not.toHaveProperty('max_completion_tokens');
      expect(sent, model).not.toHaveProperty('reasoning_effort');
    }
    expect(body('qwen3.6-35b-a3b')).toMatchObject({ chat_template_kwargs: { enable_thinking: false } });
    // Mistral's chat template takes no such argument (HTTP 400).
    expect(body('mistral-medium-3.5-128b')).not.toHaveProperty('chat_template_kwargs');
  });

  it('asks every model for JSON that follows the schema strictly', () => {
    for (const model of ['gpt-6-luna', 'qwen3.6-35b-a3b']) {
      expect(body(model).response_format).toEqual({
        type: 'json_schema',
        json_schema: { name: 'translations', strict: true, schema: { type: 'object' } },
      });
    }
  });

  it('gives the answer room for the texts and for the reasoning the effort needs, within 1,000 and 32,000 tokens', () => {
    expect(tokenBudget(0, 'none')).toBe(1000);
    expect(tokenBudget(3000, 'none')).toBe(2500);
    expect(tokenBudget(3000, 'low')).toBe(3500);
    expect(tokenBudget(3000, 'medium')).toBe(5500);
    expect(tokenBudget(3000, 'xhigh')).toBe(18500);
    expect(tokenBudget(200_000, 'xhigh')).toBe(32000);
  });
});
