import { displayKey } from '../../model/keys';
import { compareTags } from '../html';
import type { Rule } from '../types';
import { finding, translationPairs, valueLocation } from './support';

/** Tags that the translation dropped or added compared with the reference text. */
export const htmlMismatchRule: Rule = {
  id: 'html-mismatch',
  defaultSeverity: 'warning',
  run: (ctx) =>
    ctx.bundles.flatMap((bundle) =>
      translationPairs(bundle).flatMap(({ locale, key, referenceText, text }) => {
        const { missing, extra } = compareTags(referenceText, text);
        if (missing.length === 0 && extra.length === 0) {
          return [];
        }
        return [
          finding('html-mismatch', bundle, {
            locale,
            key,
            args: {
              key: displayKey(key),
              reference: bundle.reference ?? '',
              missing: missing.map(asTag),
              extra: extra.map(asTag),
            },
            location: valueLocation(bundle, locale, key),
          }),
        ];
      }),
    ),
};

/** `/b` → `</b>`, `b` → `<b>`. */
function asTag(signature: string): string {
  return signature.startsWith('/') ? `</${signature.slice(1)}>` : `<${signature}>`;
}
