import { displayKey } from '../../model/keys';
import { VALUE_FIELD } from '../../model/types';
import { scanPlaceholders } from '../placeholders';
import type { Rule } from '../types';
import { finding, isReadable, valueLocation } from './support';

/** Stray or empty braces in any readable file, e.g. `{{{count}}`: ngx-translate renders them literally. */
export const placeholderMalformedRule: Rule = {
  id: 'placeholder-malformed',
  defaultSeverity: 'error',
  run: (ctx) =>
    ctx.bundles.flatMap((bundle) =>
      bundle.locales
        .filter((locale) => isReadable(bundle, locale))
        .flatMap((locale) =>
          (bundle.file(locale)?.parsed.entries ?? []).flatMap((entry) => {
            const { malformed } = scanPlaceholders(entry.fields[VALUE_FIELD]?.value ?? '');
            if (malformed.length === 0) {
              return [];
            }
            return [
              finding('placeholder-malformed', bundle, {
                locale,
                key: entry.key,
                args: { key: displayKey(entry.key), text: malformed.map((item) => item.text).join(' ') },
                location: valueLocation(bundle, locale, entry.key),
              }),
            ];
          }),
        ),
    ),
};
