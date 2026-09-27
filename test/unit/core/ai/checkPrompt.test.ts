import { describe, expect, it } from 'vitest';
import { AiError } from '../../../../src/core/ai/aiErrors';
import {
  CHECK_FORMAT,
  checkMessages,
  parseCheck,
  type CheckPrompt,
} from '../../../../src/core/ai/checkPrompt';

const prompt = (changes: Partial<CheckPrompt> = {}): CheckPrompt => ({
  source: { code: 'de', description: "German (formal, use 'Sie')" },
  target: { code: 'fr', description: 'French' },
  variant: false,
  syntax: 'double-brace',
  html: false,
  uiLanguage: 'German',
  items: [
    {
      key: 'SEARCH.HINT',
      source: 'Suche nach {{count}} <b>Inhalten</b>',
      text: 'Chercher {{count}} <b>contenus</b>',
      context: { en: 'Search {{count}} <b>items</b>' },
    },
  ],
  ...changes,
});

describe('checkMessages', () => {
  it('asks for a verdict on each translation, the problem in the language of VS Code, with a correction', () => {
    const [system, user] = checkMessages(prompt());
    expect(system!.role).toBe('system');
    expect(system!.content).toContain("from German (formal, use 'Sie') [de] to French [fr]");
    expect(system!.content).toContain('Write the problem in German');
    expect(system!.content).toContain('{{name}}');
    expect(user).toEqual({
      role: 'user',
      content: JSON.stringify({
        items: [
          {
            key: 'SEARCH.HINT',
            source: 'Suche nach {{count}} <b>Inhalten</b>',
            translation: 'Chercher {{count}} <b>contenus</b>',
            context: { en: 'Search {{count}} <b>items</b>' },
          },
        ],
      }),
    });
  });

  it('checks a variant against its base, and mail templates with their conditions', () => {
    const variant = checkMessages(
      prompt({ variant: true, target: { code: 'de-informal', description: "German informal: use 'du'" } }),
    )[0]!.content;
    expect(variant).toContain("German informal: use 'du' [de-informal] is a variant of");
    expect(variant).toContain('only where the variant needs it');
    expect(checkMessages(prompt({ html: true }))[0]!.content).toContain('{{if …}}');
    expect(checkMessages(prompt({ syntax: 'single-brace' }))[0]!.content).toContain('{name}');
  });

  it('keeps its wording, which review diffs show', () => {
    expect(checkMessages(prompt())[0]!.content).toMatchSnapshot();
    expect(
      checkMessages(
        prompt({ variant: true, target: { code: 'de-informal', description: "German informal: use 'du'" } }),
      )[0]!.content,
    ).toMatchSnapshot();
  });
});

describe('CHECK_FORMAT', () => {
  it('is strict: each item has its key, verdict, severity, problem and suggestion, and nothing else', () => {
    const item = (CHECK_FORMAT.schema as { properties: { items: { items: Record<string, unknown> } } })
      .properties.items.items;
    expect(item['required']).toEqual(['key', 'verdict', 'severity', 'problem', 'suggestion']);
    expect(item['additionalProperties']).toBe(false);
  });
});

describe('parseCheck', () => {
  const answer = (items: unknown[]) => JSON.stringify({ items });

  it('takes the verdicts by key: fine, or a problem with its severity, its text and a correction', () => {
    const result = parseCheck(
      answer([
        {
          key: 'B',
          verdict: 'problem',
          severity: 'error',
          problem: 'Der Platzhalter fehlt.',
          suggestion: 'Voir {{n}}',
        },
        { key: 'A', verdict: 'ok', severity: 'info', problem: '', suggestion: '' },
        { key: 'X', verdict: 'ok', severity: 'info', problem: '', suggestion: '' },
        { key: 'C', verdict: 'problem', severity: 'warning', problem: 'Holprig.', suggestion: '  ' },
      ]),
      ['A', 'B', 'C', 'D'],
    );
    expect(result.verdicts.get('A')).toEqual({ ok: true });
    expect(result.verdicts.get('B')).toEqual({
      ok: false,
      severity: 'error',
      problem: 'Der Platzhalter fehlt.',
      suggestion: 'Voir {{n}}',
    });
    // No correction: the problem alone.
    expect(result.verdicts.get('C')).toEqual({ ok: false, severity: 'warning', problem: 'Holprig.' });
    expect(result.missing).toEqual(['D']);
    expect(result.unknown).toBe(1);
  });

  it('counts a problem it cannot show as no answer, and takes an unknown severity for a warning', () => {
    const result = parseCheck(
      answer([
        { key: 'A', verdict: 'problem', severity: 'error', problem: ' ', suggestion: 'x' },
        { key: 'B', verdict: 'problem', severity: 'fatal', problem: 'Falsch.', suggestion: '' },
        { key: 'C', verdict: 'maybe', severity: 'info', problem: '', suggestion: '' },
      ]),
      ['A', 'B', 'C'],
    );
    expect(result.verdicts.get('B')).toEqual({ ok: false, severity: 'warning', problem: 'Falsch.' });
    expect(result.missing).toEqual(['A', 'C']);
  });

  it('refuses an answer that is no JSON of the schema', () => {
    expect(() => parseCheck('not json', ['A'])).toThrow(AiError);
    expect(() => parseCheck('{"verdicts": []}', ['A'])).toThrow(AiError);
  });
});
