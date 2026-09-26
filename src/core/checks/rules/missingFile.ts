import type { Rule } from '../types';
import { finding, isFullLocale, isOverrideBundle } from './support';

/**
 * A full locale that occurs in the area but has no file in this bundle; the runtime falls back entirely. An override
 * bundle needs no file where it changes nothing.
 */
export const missingFileRule: Rule = {
  id: 'missing-file',
  defaultSeverity: 'warning',
  run(ctx) {
    const areaLocales = [...new Set(ctx.bundles.flatMap((bundle) => bundle.locales))]
      .filter((locale) => isFullLocale(ctx, locale))
      .sort();
    const full = ctx.bundles.filter((bundle) => !isOverrideBundle(ctx.area, bundle.name));
    return full.flatMap((bundle) => {
      const anchor = bundle.file(bundle.reference ?? bundle.locales[0] ?? '');
      return areaLocales
        .filter((locale) => !bundle.file(locale))
        .map((locale) =>
          finding('missing-file', bundle, {
            locale,
            args: { locale, bundle: bundle.name },
            ...(anchor ? { location: { relPath: anchor.relPath, range: [0, 0] as [number, number] } } : {}),
          }),
        );
    });
  },
};
