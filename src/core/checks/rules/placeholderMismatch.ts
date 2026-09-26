import { displayKey } from '../../model/keys';
import { asPlaceholder, compareParams, scanPlaceholders } from '../placeholders';
import type { Rule } from '../types';
import { finding, translationPairs, valueLocation } from './support';

/** A parameter the translation lacks is shown as raw text at runtime; an extra one is never filled. */
export const placeholderMismatchRule: Rule = {
  id: 'placeholder-mismatch',
  defaultSeverity: 'error',
  run: (ctx) =>
    ctx.bundles.flatMap((bundle) =>
      translationPairs(bundle).flatMap(({ locale, key, referenceText, text }) => {
        const syntax = ctx.area.placeholderSyntax;
        const { missing, extra } = compareParams(
          scanPlaceholders(referenceText, syntax),
          scanPlaceholders(text, syntax),
        );
        if (missing.length === 0 && extra.length === 0) {
          return [];
        }
        return [
          finding('placeholder-mismatch', bundle, {
            locale,
            key,
            args: {
              key: displayKey(key),
              reference: bundle.reference ?? '',
              missing: missing.map((name) => asPlaceholder(name, syntax)),
              extra: extra.map((name) => asPlaceholder(name, syntax)),
            },
            location: valueLocation(bundle, locale, key),
          }),
        ];
      }),
    ),
};
