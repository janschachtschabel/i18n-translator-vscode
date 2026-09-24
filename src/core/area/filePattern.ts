import { BASE_FILE_LOCALE } from '../model/locale';
import type { LocaleCode } from '../model/types';

export interface FilePatternSpec {
  /**
   * Path pattern relative to the area root, with `/` as separator: `{bundle}` and `{locale}` placeholders,
   * `[...]` marks an optional part. Examples: `{bundle}/{locale}.json`, `{bundle}[_{locale}].properties`.
   */
  files: string;
  /** Regular expression source for `{locale}`. */
  localePattern: string;
  /** Regular expression source for `{bundle}`; default: a single path segment, as short as possible. */
  bundlePattern?: string;
  /** Bundle name to use when `files` has no `{bundle}` placeholder. */
  bundleName?: string;
}

export interface PatternMatch {
  bundle: string;
  /** `default` when the optional locale part is absent. */
  locale: LocaleCode;
}

const DEFAULT_BUNDLE_PATTERN = '[^/]+?';

/** Compiles a file pattern; throws a SyntaxError with a user-readable message if it is invalid. */
export function compileFilePattern(spec: FilePatternSpec): (relPath: string) => PatternMatch | null {
  assertValidRegex(spec.localePattern, 'localePattern');
  if (spec.bundlePattern !== undefined) {
    assertValidRegex(spec.bundlePattern, 'bundlePattern');
  }
  const { source, hasBundle, hasLocale } = toRegexSource(spec);
  if (!hasLocale) {
    throw new SyntaxError(`File pattern "${spec.files}" needs a {locale} placeholder.`);
  }
  const bundleName = spec.bundleName;
  if (!hasBundle && !bundleName) {
    throw new SyntaxError(
      `File pattern "${spec.files}" has no {bundle} placeholder, so a bundleName is required.`,
    );
  }

  let regex: RegExp;
  try {
    regex = new RegExp(`^${source}$`);
  } catch (error) {
    throw new SyntaxError(`File pattern "${spec.files}" cannot be compiled: ${(error as Error).message}`, {
      cause: error,
    });
  }

  return (relPath) => {
    const groups = regex.exec(relPath)?.groups;
    if (!groups) {
      return null;
    }
    return { bundle: groups['bundle'] ?? bundleName!, locale: groups['locale'] ?? BASE_FILE_LOCALE };
  };
}

function toRegexSource(spec: FilePatternSpec): { source: string; hasBundle: boolean; hasLocale: boolean } {
  let source = '';
  let depth = 0;
  let hasBundle = false;
  let hasLocale = false;
  let rest = spec.files;

  while (rest.length > 0) {
    if (rest.startsWith('{bundle}') || rest.startsWith('{locale}')) {
      const isBundle = rest.startsWith('{bundle}');
      if (isBundle ? hasBundle : hasLocale) {
        throw new SyntaxError(`File pattern "${spec.files}" may contain ${rest.slice(0, 8)} only once.`);
      }
      source += isBundle
        ? `(?<bundle>${spec.bundlePattern ?? DEFAULT_BUNDLE_PATTERN})`
        : `(?<locale>${spec.localePattern})`;
      hasBundle ||= isBundle;
      hasLocale ||= !isBundle;
      rest = rest.slice(8);
      continue;
    }
    const char = rest[0]!;
    if (char === '[') {
      source += '(?:';
      depth++;
    } else if (char === ']') {
      if (depth === 0) {
        throw new SyntaxError(`File pattern "${spec.files}" has a closing bracket without an opening one.`);
      }
      source += ')?';
      depth--;
    } else {
      source += char.replace(/[.*+?^${}()|\\]/, '\\$&');
    }
    rest = rest.slice(1);
  }
  if (depth !== 0) {
    throw new SyntaxError(`File pattern "${spec.files}" has an unclosed bracket.`);
  }
  return { source, hasBundle, hasLocale };
}

function assertValidRegex(source: string, name: string): void {
  try {
    new RegExp(source);
  } catch (error) {
    throw new SyntaxError(`${name} is not a valid regular expression: ${(error as Error).message}`, {
      cause: error,
    });
  }
}
