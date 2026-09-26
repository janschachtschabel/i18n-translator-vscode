import { describe, expect, it } from 'vitest';
import { lostCharacterRule } from '../../../../../src/core/checks/rules/lostCharacter';
import { bundleOf, run, summarize } from './helpers';

const REPLACEMENT = String.fromCharCode(0xfffd);

describe('lost-character', () => {
  // A file saved in an encoding that lacks a character keeps a "?" for it: ’ in French elisions, œ in nœud.
  it('reports a question mark between letters and a replacement character, in every language', () => {
    const bundle = bundleOf('common', {
      de: `{"A":"Gr${REPLACEMENT}ße","B":"Warum?","C":"Datei"}`,
      fr: '{"A":"Durée de l?apprentissage","B":"Pourquoi ?","C":"Supprimer un n?ud"}',
      'de-informal': '{"A":"Gr??e"}',
    });
    expect(summarize(run(lostCharacterRule, [bundle]), 'locale')).toEqual([
      'lost-character common/de A locale="de"',
      'lost-character common/de-informal A locale="de-informal"',
      'lost-character common/fr A locale="fr"',
      'lost-character common/fr C locale="fr"',
    ]);
  });

  it('leaves question marks alone that end a question or stand in links, tags and placeholders', () => {
    const bundle = bundleOf('common', {
      de:
        '{"A":"Warum?","B":"Quoi ?","C":"?","D":"<a href=\'/s?q=x\'>Suche</a>",' +
        '"E":"siehe https://example.org/a?b=c","F":"{{a?b}}"}',
    });
    expect(run(lostCharacterRule, [bundle])).toEqual([]);
  });

  it('points to the text', () => {
    const [finding] = run(lostCharacterRule, [bundleOf('common', { de: '{"A":"l?a"}' })]);
    expect(finding?.location).toEqual({ relPath: 'i18n/common/de.json', range: [5, 10] });
  });
});
