import type { PlaceholderSyntax } from '../area/areaDefinition';
import { withoutTags } from './html';
import { withoutPlaceholders } from './placeholders';

/** The words a reader sees: placeholder names and tags are not translated. */
export function readerText(text: string, syntax: PlaceholderSyntax | undefined): string {
  return withoutTags(withoutPlaceholders(text, syntax));
}

/** An address such as `http://…`: letters in it are no words. */
const URL = /[a-z][a-z0-9+.-]*:\/\/\S*/gi;

/** Whether a text has words to translate: letters outside links, placeholders and tags (a license link has none). */
export function hasTextToTranslate(text: string, syntax: PlaceholderSyntax | undefined): boolean {
  return /\p{L}/u.test(readerText(text, syntax).replace(URL, ' '));
}
