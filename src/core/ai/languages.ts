/**
 * What a language is, for a prompt: its description in the settings (e.g. that `de-informal` uses "du"), else its
 * English name (`fr_FR`: "French (France)"), else its code. The file without a locale (`default`) holds
 * `baseFileLanguage`.
 */
export function describeLanguage(
  code: string,
  descriptions: Readonly<Record<string, string>>,
  baseFileLanguage?: string,
): string {
  const described = descriptions[code];
  if (described !== undefined) {
    return described;
  }
  if (code === 'default' && baseFileLanguage !== undefined) {
    return describeLanguage(baseFileLanguage, descriptions);
  }
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(
      code.replace(/_/g, '-'),
    );
    return name ?? code;
  } catch {
    // No language tag, e.g. a code of a custom area.
    return code;
  }
}
