import { displayKey } from '../../model/keys';
import { asCondition, compareConditions, scanPlaceholders } from '../placeholders';
import type { Rule } from '../types';
import { finding, translationPairs, valueLocation } from './support';

/**
 * The conditions of mail texts, `{{if …}} … {{endif}}`: edu-sharing (Mail.replaceString) cannot evaluate an
 * {{if …}} without its {{endif}} and sends no mail, an {{endif}} before any condition shows in the mail, and a
 * condition the reference does not have is never true. Areas with single braces have no conditions.
 */
export const conditionUnbalancedRule: Rule = {
  id: 'condition-unbalanced',
  defaultSeverity: 'error',
  run: (ctx) =>
    ctx.area.placeholderSyntax === 'single-brace'
      ? []
      : ctx.bundles.flatMap((bundle) =>
          translationPairs(bundle).flatMap(({ locale, key, referenceText, text }) => {
            const scan = scanPlaceholders(text);
            const { missing, extra } = compareConditions(scanPlaceholders(referenceText), scan);
            if (missing.length === 0 && extra.length === 0 && scan.unpaired.length === 0) {
              return [];
            }
            return [
              finding('condition-unbalanced', bundle, {
                locale,
                key,
                args: {
                  key: displayKey(key),
                  reference: bundle.reference ?? '',
                  missing: missing.map(asCondition),
                  extra: extra.map(asCondition),
                  unpaired: scan.unpaired,
                },
                location: valueLocation(bundle, locale, key),
              }),
            ];
          }),
        ),
};
