import { displayKey } from '../../model/keys';
import { VALUE_FIELD } from '../../model/types';
import { wordsOnly } from '../translatable';
import type { Rule } from '../types';
import { finding, isReadable, valueLocation } from './support';

/** U+FFFD, which a decoder puts where bytes were no character of the encoding it read them in. */
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/**
 * What is left of a character a file could not hold when it was saved in a narrower encoding: a question mark
 * between letters (`l?apprentissage` for `l’apprentissage`, `n?ud` for `nœud`), or the replacement character. A
 * question mark in a link, a tag or a placeholder is left alone.
 */
function hasLostCharacter(words: string): boolean {
  return /\p{L}\?+\p{L}/u.test(words) || words.includes(REPLACEMENT_CHARACTER);
}

export const lostCharacterRule: Rule = {
  id: 'lost-character',
  defaultSeverity: 'warning',
  run: (ctx) =>
    ctx.bundles.flatMap((bundle) =>
      bundle.locales
        .filter((locale) => isReadable(bundle, locale))
        .flatMap((locale) =>
          bundle
            .file(locale)!
            .parsed.entries.filter((entry) =>
              hasLostCharacter(wordsOnly(entry.fields[VALUE_FIELD]?.value ?? '', ctx.area.placeholderSyntax)),
            )
            .map(({ key }) =>
              finding('lost-character', bundle, {
                locale,
                key,
                args: { key: displayKey(key), locale },
                location: valueLocation(bundle, locale, key),
              }),
            ),
        ),
    ),
};
