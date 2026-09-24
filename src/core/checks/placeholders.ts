/** `{{…}}` placeholders as used by ngx-translate and edu-sharing mail templates. */
export interface PlaceholderScan {
  /** Parameter names, trimmed, sorted and unique. */
  params: string[];
  /** Conditions of `{{if …}}` blocks (mail templates), sorted and unique. */
  conditions: string[];
  endifs: number;
  /** `{{GENDER_SEPARATOR}}` is a German gender marker replaced at runtime, not a parameter. */
  genderSeparators: number;
  /** Stray braces or empty placeholders, in text order. */
  malformed: MalformedPlaceholder[];
}

export interface MalformedPlaceholder {
  index: number;
  text: string;
}

const TOKEN = /\{\{([^{}]*)\}\}/g;
const GENDER_SEPARATOR = 'GENDER_SEPARATOR';

export function scanPlaceholders(text: string): PlaceholderScan {
  const params = new Set<string>();
  const conditions = new Set<string>();
  const malformed: MalformedPlaceholder[] = [];
  let endifs = 0;
  let genderSeparators = 0;
  let residual = '';
  let last = 0;

  for (const match of text.matchAll(TOKEN)) {
    const index = match.index;
    const name = match[1]!.trim();
    // Blank out valid tokens so that the remaining braces can be reported at their original index.
    residual += text.slice(last, index) + ' '.repeat(match[0].length);
    last = index + match[0].length;

    if (name === '') {
      malformed.push({ index, text: match[0] });
    } else if (name === GENDER_SEPARATOR) {
      genderSeparators++;
    } else if (name === 'endif') {
      endifs++;
    } else if (name.startsWith('if ')) {
      conditions.add(name.slice(3).trim());
    } else {
      params.add(name);
    }
  }
  residual += text.slice(last);
  for (const run of residual.matchAll(/[{}]+/g)) {
    malformed.push({ index: run.index, text: run[0] });
  }

  return {
    params: [...params].sort(),
    conditions: [...conditions].sort(),
    endifs,
    genderSeparators,
    malformed: malformed.sort((a, b) => a.index - b.index),
  };
}

/** Parameters of the reference that the translation lacks, and parameters only the translation has. */
export function compareParams(
  reference: PlaceholderScan,
  translation: PlaceholderScan,
): { missing: string[]; extra: string[] } {
  return {
    missing: reference.params.filter((param) => !translation.params.includes(param)),
    extra: translation.params.filter((param) => !reference.params.includes(param)),
  };
}
