import { displayKey } from '../../model/keys';
import { VALUE_FIELD } from '../../model/types';
import type { CheckContext, Finding, Rule } from '../types';
import type { CompiledVariant } from '../variants';
import { entryIds, finding, isReadable, keyLocation, valueLocation } from './support';

/** Variants that at least one bundle of the area has a file for; others are not in use here. */
function usedVariants(ctx: CheckContext): CompiledVariant[] {
  const locales = new Set(ctx.bundles.flatMap((bundle) => bundle.locales));
  return [...ctx.variants.values()].filter((variant) => locales.has(variant.locale));
}

function variantFindings(ctx: CheckContext, map: (variant: CompiledVariant) => Finding[]): Finding[] {
  return usedVariants(ctx).flatMap(map);
}

/** The base text triggers the variant rule (e.g. formal address) but the variant has no own text for it. */
export const variantNeededRule: Rule = {
  id: 'variant-needed',
  defaultSeverity: 'warning',
  run: (ctx) =>
    variantFindings(ctx, (variant) =>
      ctx.bundles
        .filter((bundle) => variant.required && isReadable(bundle, variant.base))
        .filter((bundle) => !bundle.file(variant.locale) || isReadable(bundle, variant.locale))
        .flatMap((bundle) =>
          (bundle.file(variant.base)?.parsed.entries ?? []).flatMap((entry) => {
            const match = variant.required?.exec(entry.fields[VALUE_FIELD]?.value ?? '');
            if (!match || bundle.value(entry.key.id, variant.locale) !== undefined) {
              return [];
            }
            return [
              finding('variant-needed', bundle, {
                locale: variant.locale,
                key: entry.key,
                args: {
                  key: displayKey(entry.key),
                  locale: variant.locale,
                  base: variant.base,
                  match: match[0],
                },
                location: valueLocation(bundle, variant.base, entry.key),
              }),
            ];
          }),
        ),
    ),
};

/** The variant's own text still contains what the variant exists to avoid. */
export const variantInconsistentRule: Rule = {
  id: 'variant-inconsistent',
  defaultSeverity: 'info',
  run: (ctx) =>
    variantFindings(ctx, (variant) =>
      ctx.bundles
        .filter((bundle) => variant.forbidden && isReadable(bundle, variant.locale))
        .flatMap((bundle) =>
          (bundle.file(variant.locale)?.parsed.entries ?? []).flatMap((entry) => {
            const match = variant.forbidden?.exec(entry.fields[VALUE_FIELD]?.value ?? '');
            if (!match) {
              return [];
            }
            return [
              finding('variant-inconsistent', bundle, {
                locale: variant.locale,
                key: entry.key,
                args: { key: displayKey(entry.key), locale: variant.locale, match: match[0] },
                location: valueLocation(bundle, variant.locale, entry.key),
              }),
            ];
          }),
        ),
    ),
};

/** A variant key without a base key is never used: ngx-translate looks keys up in the base language first. */
export const variantOrphanRule: Rule = {
  id: 'variant-orphan',
  defaultSeverity: 'info',
  run: (ctx) =>
    variantFindings(ctx, (variant) =>
      ctx.bundles
        .filter((bundle) => isReadable(bundle, variant.base) && isReadable(bundle, variant.locale))
        .flatMap((bundle) => {
          const baseIds = entryIds(bundle, variant.base);
          return (bundle.file(variant.locale)?.parsed.entries ?? [])
            .filter((entry) => !baseIds.has(entry.key.id))
            .map((entry) =>
              finding('variant-orphan', bundle, {
                locale: variant.locale,
                key: entry.key,
                args: { key: displayKey(entry.key), locale: variant.locale, base: variant.base },
                location: keyLocation(bundle, variant.locale, entry.key),
              }),
            );
        }),
    ),
};
