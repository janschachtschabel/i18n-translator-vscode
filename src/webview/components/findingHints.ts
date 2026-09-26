import type { PlaceholderSyntax } from '../../core/area/areaDefinition';
import { l10n } from '../l10n';

/**
 * How to solve a finding in a cell (design §7.1: findings with explanation and solution); its message is the
 * explanation. Undefined for findings that no cell shows, e.g. about a file. Placeholders are named in the syntax
 * of the bundle's area.
 */
export function hintFor(rule: string, syntax: PlaceholderSyntax = 'double-brace'): string | undefined {
  switch (rule) {
    case 'missing-key':
      return l10n.t('Add the translation.');
    case 'empty-value':
      return l10n.t('Translate the text, or delete it so that the fallback shows again.');
    case 'orphan-key':
      return l10n.t('Add the key to the reference, or delete it in this language.');
    case 'misplaced-key':
      return l10n.t('Move the text to the key the finding suggests.');
    case 'placeholder-malformed':
      return syntax === 'single-brace'
        ? l10n.t(
            'Write each placeholder as {name}, with one brace on each side; only {{GENDER_SEPARATOR}} has two.',
          )
        : l10n.t('Write each placeholder as {{name}}, with two braces on each side.');
    case 'placeholder-mismatch':
      return l10n.t('Use the placeholders of the reference unchanged; the application fills them in.');
    case 'html-mismatch':
      return l10n.t('Use the HTML tags of the reference, so that the text keeps its formatting.');
    case 'variant-needed':
      return l10n.t('Write a text of its own for this variant, without the words the finding names.');
    case 'variant-inconsistent':
      return l10n.t('Replace the words the finding names with the wording of this variant.');
    case 'variant-orphan':
      return l10n.t('Add the key to the base language, or delete it in this variant.');
    case 'key-overridden':
      return l10n.t('Change the text in the bundle that comes later, or keep the key in one bundle only.');
    case 'subtree-lost':
      return l10n.t('Move the key into the bundle that replaces it, or rename its top-level key.');
    case 'same-as-reference':
      return l10n.t('Translate the text, unless it is meant to stay the same, e.g. a name.');
    case 'lost-character':
      return l10n.t('Put the lost character back in place of the question mark, e.g. ’ in l’apprentissage.');
    case 'duplicate-key':
      return l10n.t('Remove the other definitions from the file and keep the one the editor shows.');
    case 'bom-first-key':
      return l10n.t('Save the file without a byte order mark, or begin it with a line that is not needed.');
    case 'non-string-value':
      return l10n.t('Replace the value in the file with a text.');
    default:
      return undefined;
  }
}
