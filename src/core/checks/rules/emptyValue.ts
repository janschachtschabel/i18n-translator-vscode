import { displayKey } from '../../model/keys';
import { VALUE_FIELD } from '../../model/types';
import type { Rule } from '../types';
import { finding, isReadable, readableReference, valueLocation } from './support';

/** An empty or blank text is shown as such at runtime: it replaces the fallback instead of using it. */
export const emptyValueRule: Rule = {
  id: 'empty-value',
  defaultSeverity: 'warning',
  run: (ctx) =>
    ctx.bundles
      .filter((bundle) => readableReference(bundle) !== undefined)
      .flatMap((bundle) =>
        bundle.locales
          .filter((locale) => isReadable(bundle, locale))
          .flatMap((locale) =>
            (bundle.file(locale)?.parsed.entries ?? [])
              .filter((entry) => entry.fields[VALUE_FIELD]?.value.trim() === '')
              .map((entry) =>
                finding('empty-value', bundle, {
                  locale,
                  key: entry.key,
                  args: { key: displayKey(entry.key), locale },
                  location: valueLocation(bundle, locale, entry.key),
                }),
              ),
          ),
      ),
};
