import { describe, expect, it } from 'vitest';
import { describeLanguage } from '../../../../src/core/ai/languages';
import {
  parseTranslations,
  TRANSLATIONS_FORMAT,
  translationMessages,
  type TranslationPrompt,
} from '../../../../src/core/ai/prompts';

const DESCRIPTIONS = { de: "German (formal, use 'Sie')", 'de-informal': "German informal variant: use 'du'" };

describe('describeLanguage', () => {
  it('takes the description of the settings, else the English name, else the code', () => {
    expect(describeLanguage('de', DESCRIPTIONS)).toBe("German (formal, use 'Sie')");
    expect(describeLanguage('fr_FR', DESCRIPTIONS)).toBe('French (France)');
    expect(describeLanguage('it', DESCRIPTIONS)).toBe('Italian');
    expect(describeLanguage('xx-nonsense-123', DESCRIPTIONS)).toBe('xx-nonsense-123');
  });

  it('describes the file without a locale by the language it holds', () => {
    expect(describeLanguage('default', DESCRIPTIONS, 'en')).toBe('English');
  });
});

const prompt = (changes: Partial<TranslationPrompt> = {}): TranslationPrompt => ({
  source: { code: 'de', description: "German (formal, use 'Sie')" },
  target: { code: 'fr', description: 'French' },
  variant: false,
  syntax: 'double-brace',
  html: false,
  items: [
    {
      key: 'SEARCH.HINT',
      source: 'Suche nach {{count}} <b>Inhalten</b>',
      context: { en: 'Search {{count}} <b>items</b>' },
    },
  ],
  ...changes,
});

describe('translationMessages', () => {
  it('keeps its wording, which review diffs show: full, variant, metadatasets, mail', () => {
    const cases: Partial<TranslationPrompt>[] = [
      {},
      { variant: true, target: { code: 'de-informal', description: "German informal: use 'du'" } },
      { syntax: 'single-brace' },
      { html: true },
    ];
    for (const changes of cases) {
      expect(translationMessages(prompt(changes))[0]!.content).toMatchSnapshot();
    }
  });

  it('names both languages, the rules for placeholders and tags, and sends the texts as JSON', () => {
    const [system, user] = translationMessages(prompt());
    expect(system!.role).toBe('system');
    expect(system!.content).toContain("from German (formal, use 'Sie') [de] to French [fr]");
    expect(system!.content).toContain('e.g. {{name}}: do not translate, add or remove any');
    expect(system!.content).toContain('HTML tags');
    expect(system!.content).toContain('exactly one item per key');
    expect(JSON.parse(user!.content)).toEqual({
      items: [
        {
          key: 'SEARCH.HINT',
          source: 'Suche nach {{count}} <b>Inhalten</b>',
          context: { en: 'Search {{count}} <b>items</b>' },
        },
      ],
    });
  });

  it('shows placeholders in the syntax of the area', () => {
    const [system] = translationMessages(
      prompt({ syntax: 'single-brace', items: [{ key: 'a', source: 'Hallo {user}' }] }),
    );
    expect(system!.content).toContain('{name}');
    expect(system!.content).not.toContain('{{name}}');
  });

  it('asks a variant to change only what the variant needs', () => {
    const [system] = translationMessages(
      prompt({
        target: { code: 'de-informal', description: "German informal variant: use 'du'" },
        variant: true,
      }),
    );
    expect(system!.content).toContain("Adapt the texts to German informal variant: use 'du' [de-informal]");
    expect(system!.content).toContain('Change only what the variant needs');
  });

  it('keeps the HTML of mail templates, and the conditions in them', () => {
    const [system] = translationMessages(prompt({ html: true }));
    expect(system!.content).toContain('e-mail');
    expect(system!.content).toContain('{{if');
  });

  it('asks for an answer that names each key, in a strict schema', () => {
    expect(TRANSLATIONS_FORMAT.schema).toMatchObject({
      type: 'object',
      required: ['items'],
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: { type: 'object', required: ['key', 'text'], additionalProperties: false },
        },
      },
    });
  });
});

describe('parseTranslations', () => {
  it('takes each text by its key, in any order', () => {
    const answer = JSON.stringify({
      items: [
        { key: 'B', text: 'Bee' },
        { key: 'A', text: 'Ay' },
      ],
    });
    const { texts, missing, unknown } = parseTranslations(answer, ['A', 'B']);
    expect([...texts]).toEqual([
      ['B', 'Bee'],
      ['A', 'Ay'],
    ]);
    expect(missing).toEqual([]);
    expect(unknown).toBe(0);
  });

  it('drops keys it did not ask for and duplicates, and says which keys have no text', () => {
    const answer = JSON.stringify({
      items: [
        { key: 'A', text: 'Ay' },
        { key: 'A', text: 'Again' },
        { key: 'Z', text: 'Zed' },
        { key: 'B', text: 7 },
      ],
    });
    const { texts, missing, unknown } = parseTranslations(answer, ['A', 'B', 'C']);
    expect([...texts]).toEqual([['A', 'Ay']]);
    expect(missing).toEqual(['B', 'C']);
    expect(unknown).toBe(1);
  });

  it('fails on an answer that is no JSON of the schema', () => {
    expect(() => parseTranslations('Voilà', ['A'])).toThrow(
      expect.objectContaining({ code: 'invalid-response' }),
    );
    expect(() => parseTranslations('{"texts":[]}', ['A'])).toThrow(
      expect.objectContaining({ code: 'invalid-response' }),
    );
  });
});
