const TAG = /<(\/?)([a-z][a-z0-9-]*)\b[^<>]*>/gi;

/** Sorted tag names of a text; closing tags are prefixed with `/`. Attributes and letter case are ignored. */
export function tagSignature(text: string): string[] {
  return [...text.matchAll(TAG)].map((match) => `${match[1]}${match[2]!.toLowerCase()}`).sort();
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
