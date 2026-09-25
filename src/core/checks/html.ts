const TAG = /<(\/?)([a-z][a-z0-9-]*)\b[^<>]*>/gi;

/**
 * HTML elements that occur in UI texts and mail templates. Other words in angle brackets are text:
 * edu-sharing uses labels such as `<keine>` or `<sonstige>` that translations rightly change.
 */
// prettier-ignore
const HTML_ELEMENTS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button',
  'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'font', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr',
  'html', 'i', 'img', 'ins', 'kbd', 'label', 'li', 'link', 'main', 'mark', 'meta', 'nav', 'ol', 'p', 'pre',
  'q', 's', 'samp', 'section', 'small', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'tt', 'u', 'ul', 'var', 'wbr',
]);

/** Sorted tag names of a text; closing tags are prefixed with `/`. Attributes and letter case are ignored. */
export function tagSignature(text: string): string[] {
  return [...text.matchAll(TAG)]
    .map((match) => ({ closing: match[1]!, name: match[2]!.toLowerCase() }))
    .filter(({ name }) => HTML_ELEMENTS.has(name))
    .map(({ closing, name }) => `${closing}${name}`)
    .sort();
}

/** The text with its HTML tags blanked out; other words in angle brackets stay, as they are text. */
export function withoutTags(text: string): string {
  return text.replace(TAG, (tag, _closing, name: string) =>
    HTML_ELEMENTS.has(name.toLowerCase()) ? ' ' : tag,
  );
}

/** A tag of {@link tagSignature} as it is written in a text: `/b` → `</b>`, `b` → `<b>`. */
export function asTag(signature: string): string {
  return signature.startsWith('/') ? `</${signature.slice(1)}>` : `<${signature}>`;
}

/** Tags of the reference that the translation lacks, and tags only the translation has (counted). */
export function compareTags(reference: string, translation: string): { missing: string[]; extra: string[] } {
  const remaining = tagSignature(translation);
  const missing: string[] = [];
  for (const tag of tagSignature(reference)) {
    const index = remaining.indexOf(tag);
    if (index === -1) {
      missing.push(tag);
    } else {
      remaining.splice(index, 1);
    }
  }
  return { missing, extra: remaining };
}
