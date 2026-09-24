import { displayKey } from '../../model/keys';
import { VALUE_FIELD } from '../../model/types';
import type { Rule } from '../types';
import { finding, isReadable, readableReference, valueLocation } from './support';

/**
 * A blank translation of a text the reference (for variants: their base) has. At runtime the blank text
 * is shown instead of the fallback. Texts that are blank in the reference too are intentional (prefixes,
 * labels a language does not need) and not reported.
 */
export const emptyValueRule: Rule = {
  id: 'empty-value',
  defaultSeverity: 'warning',
  run: (ctx) =>
    ctx.bundles.flatMap((bundle) => {
      const reference = readableReference(bundle);
      if (reference === undefined) {
        return [];
      }
      return bundle.locales
        .filter((locale) => locale !== reference && isReadable(bundle, locale))
        .flatMap((locale) => {
          const source = ctx.variants.get(locale)?.base ?? reference;
          return (bundle.file(locale)?.parsed.entries ?? [])
            .filter(
              (entry) =>
                entry.fields[VALUE_FIELD]?.value.trim() === '' && bundle.value(entry.key.id, source)?.trim(),
            )
            .map((entry) =>
              finding('empty-value', bundle, {
                locale,
                key: entry.key,
                args: { key: displayKey(entry.key), locale },
                location: valueLocation(bundle, locale, entry.key),
              }),
            );
        });
    }),
};
