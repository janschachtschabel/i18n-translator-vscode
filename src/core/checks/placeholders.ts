import type { PlaceholderSyntax } from '../area/areaDefinition';

/** Placeholders as an area writes them: `{{…}}` (ngx-translate, mail templates) or `{…}` (metadatasets). */
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

// edu-sharing replaces exactly this token (translation-loader.ts, I18nAngular.java, MetadataReader.java), also in
// texts with single-brace placeholders; other spellings stay visible.
const GENDER_MARKER = '{{GENDER_SEPARATOR}}';
const TOKENS: Readonly<Record<PlaceholderSyntax, RegExp>> = {
  'double-brace': /\{\{([^{}]*)\}\}/g,
  'single-brace': /\{\{GENDER_SEPARATOR\}\}|\{([^{}]*)\}/g,
};

export function scanPlaceholders(text: string, syntax: PlaceholderSyntax = 'double-brace'): PlaceholderScan {
  const params = new Set<string>();
  const conditions = new Set<string>();
  const malformed: MalformedPlaceholder[] = [];
  let endifs = 0;
  let genderSeparators = 0;
  let residual = '';
  let last = 0;

  for (const match of text.matchAll(TOKENS[syntax])) {
    const index = match.index;
    const name = (match[1] ?? '').trim();
    // Blank out valid tokens so that the remaining braces can be reported at their original index.
    residual += text.slice(last, index) + ' '.repeat(match[0].length);
    last = index + match[0].length;

    if (match[0] === GENDER_MARKER) {
      genderSeparators++;
    } else if (name === '' || name === 'GENDER_SEPARATOR') {
      malformed.push({ index, text: match[0] });
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

/** The text with its placeholders blanked out. */
export function withoutPlaceholders(text: string, syntax: PlaceholderSyntax = 'double-brace'): string {
  return text.replace(TOKENS[syntax], ' ');
}

/** A parameter name as it is written in a text: `date` → `{{date}}`, or `{date}` with single braces. */
export function asPlaceholder(name: string, syntax: PlaceholderSyntax = 'double-brace'): string {
  return syntax === 'single-brace' ? `{${name}}` : `{{${name}}}`;
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
