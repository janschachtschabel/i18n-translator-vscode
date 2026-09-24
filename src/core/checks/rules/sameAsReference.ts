import { displayKey } from '../../model/keys';
import type { Rule } from '../types';
import { finding, isFullLocale, translationPairs, valueLocation } from './support';

const MIN_LETTERS = 4;

/** A translation identical to the reference text may be untranslated; short or ignored texts are left out. */
export const sameAsReferenceRule: Rule = {
  id: 'same-as-reference',
  defaultSeverity: 'info',
  run: (ctx) =>
    ctx.bundles.flatMap((bundle) =>
      translationPairs(bundle)
        .filter(
          ({ locale, referenceText, text }) =>
            isFullLocale(ctx, locale) &&
            text === referenceText &&
            !ctx.ignoreSameAsReference.includes(text) &&
            (text.match(/\p{L}/gu)?.length ?? 0) >= MIN_LETTERS,
        )
        .map(({ locale, key }) =>
          finding('same-as-reference', bundle, {
            locale,
            key,
            args: { key: displayKey(key), locale },
            location: valueLocation(bundle, locale, key),
          }),
        ),
    ),
};
