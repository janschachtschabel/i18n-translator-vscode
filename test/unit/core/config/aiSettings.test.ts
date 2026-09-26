import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, parseAiSettings } from '../../../../src/core/config/aiSettings';

const parse = (raw: Record<string, unknown>) => parseAiSettings(raw);

describe('parseAiSettings', () => {
  it('takes the defaults when nothing is set: the b-api staging and gpt-6-luna', () => {
    expect(parse({})).toEqual({ settings: DEFAULT_AI_SETTINGS, errors: [] });
    expect(DEFAULT_AI_SETTINGS).toMatchObject({
      enabled: true,
      baseUrl: 'https://b-api.staging.openeduhub.net',
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEffort: 'low',
      reviewReasoningEffort: 'medium',
      batchSize: 25,
      maxConcurrency: 2,
      timeoutSeconds: 120,
    });
    expect(DEFAULT_AI_SETTINGS.languageDescriptions['de-informal']).toContain("'du'");
  });

  it('takes valid values, the address without a slash at the end', () => {
    const { settings, errors } = parse({
      'ai.enabled': false,
      'ai.baseUrl': 'https://b-api.prod.openeduhub.net/',
      'ai.provider': 'academiccloud',
      'ai.model': 'qwen3.6-35b-a3b',
      'ai.reasoningEffort': 'none',
      'ai.reviewReasoningEffort': 'xhigh',
      'ai.batchSize': 100,
      'ai.maxConcurrency': 6,
      'ai.timeoutSeconds': 10,
      'ai.languageDescriptions': { fr_FR: 'French (France), formal "vous"' },
    });
    expect(errors).toEqual([]);
    expect(settings).toEqual({
      enabled: false,
      baseUrl: 'https://b-api.prod.openeduhub.net',
      provider: 'academiccloud',
      model: 'qwen3.6-35b-a3b',
      reasoningEffort: 'none',
      reviewReasoningEffort: 'xhigh',
      batchSize: 100,
      maxConcurrency: 6,
      timeoutSeconds: 10,
      languageDescriptions: { fr_FR: 'French (France), formal "vous"' },
    });
  });

  it('allows plain http only on this machine, and an address with a path', () => {
    for (const url of [
      'http://127.0.0.1:4711',
      'http://localhost:8080/',
      'http://[::1]:9000',
      'https://proxy.example/b-api',
    ]) {
      expect(parse({ 'ai.baseUrl': url }).errors, url).toEqual([]);
    }
    expect(parse({ 'ai.baseUrl': 'https://proxy.example/b-api/' }).settings.baseUrl).toBe(
      'https://proxy.example/b-api',
    );
  });

  it('refuses addresses that would send the key in the clear or elsewhere, and falls back to the default', () => {
    for (const url of [
      'http://b-api.staging.openeduhub.net',
      'ftp://example.org',
      'https://user:secret@example.org',
      'https://example.org/?key=1',
      'https://example.org/#part',
      'not a url',
      '',
      42,
    ]) {
      const { settings, errors } = parse({ 'ai.baseUrl': url });
      expect(settings.baseUrl, String(url)).toBe(DEFAULT_AI_SETTINGS.baseUrl);
      expect(errors, String(url)).toEqual(['eduI18n.ai.baseUrl has an invalid value; the default is used.']);
    }
  });

  it('refuses unknown providers, model ids that are no ids, and efforts the b-api refuses', () => {
    const { settings, errors } = parse({
      'ai.provider': 'mistral',
      'ai.model': 'gpt 6',
      'ai.reasoningEffort': 'minimal',
      'ai.reviewReasoningEffort': 3,
      'ai.enabled': 'yes',
    });
    expect(settings).toEqual(DEFAULT_AI_SETTINGS);
    expect(errors).toHaveLength(5);
    expect(parse({ 'ai.model': 'openai/gpt-6' }).errors).toHaveLength(1);
    expect(parse({ 'ai.model': 'x'.repeat(101) }).errors).toHaveLength(1);
  });

  it('keeps the batch settings within their limits', () => {
    for (const [key, value] of [
      ['ai.batchSize', 0],
      ['ai.batchSize', 101],
      ['ai.batchSize', 2.5],
      ['ai.maxConcurrency', 7],
      ['ai.maxConcurrency', 0],
      ['ai.timeoutSeconds', 5],
      ['ai.timeoutSeconds', 601],
    ] as const) {
      const { settings, errors } = parse({ [key]: value });
      expect(settings, `${key} ${value}`).toEqual(DEFAULT_AI_SETTINGS);
      expect(errors, `${key} ${value}`).toHaveLength(1);
    }
  });

  it('takes language descriptions of up to 500 characters and reports the others', () => {
    const { settings, errors } = parse({
      'ai.languageDescriptions': { fr_FR: 'French', it_IT: 'x'.repeat(501), es_ES: 7, '': 'no code' },
    });
    expect(settings.languageDescriptions).toEqual({ fr_FR: 'French' });
    expect(errors).toEqual([
      'eduI18n.ai.languageDescriptions.it_IT must be a text of at most 500 characters.',
      'eduI18n.ai.languageDescriptions.es_ES must be a text of at most 500 characters.',
      'eduI18n.ai.languageDescriptions: a language code must not be empty.',
    ]);
    expect(parse({ 'ai.languageDescriptions': ['de'] }).errors).toEqual([
      'eduI18n.ai.languageDescriptions must map language codes to descriptions.',
    ]);
  });
});
