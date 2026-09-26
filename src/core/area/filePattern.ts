import { BASE_FILE_LOCALE } from '../model/locale';
import type { LocaleCode } from '../model/types';
import { isPlainRelativePath } from './rootPath';

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
  /** Bundle name of files without a bundle part: `files` has no `{bundle}`, or it is optional and absent. */
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
  // The files lie below the area root; the host checks the paths it writes too.
  if (!isPlainRelativePath(spec.files.replace(/\{(?:bundle|locale)\}/g, 'x').replace(/[[\]]/g, ''))) {
    throw new SyntaxError(
      `File pattern "${spec.files}" must be a relative path below the area root, with "/" between folders and without "." or "..".`,
    );
  }
  assertEmbeddableRegex(spec.localePattern, 'localePattern');
  if (spec.bundlePattern !== undefined) {
    assertEmbeddableRegex(spec.bundlePattern, 'bundlePattern');
  }
  const { source, bundle, hasLocale } = toRegexSource(spec);
  if (!hasLocale) {
    throw new SyntaxError(`File pattern "${spec.files}" needs a {locale} placeholder.`);
  }
  const bundleName = spec.bundleName;
  if (bundle !== 'required' && !bundleName) {
    throw new SyntaxError(
      bundle === 'absent'
        ? `File pattern "${spec.files}" has no {bundle} placeholder, so a bundleName is required.`
        : `File pattern "${spec.files}" has {bundle} in an optional part, so a bundleName is required as fallback.`,
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
    const bundle = groups?.['bundle'] ?? bundleName;
    if (!groups || bundle === undefined) {
      return null;
    }
    return { bundle, locale: groups['locale'] ?? BASE_FILE_LOCALE };
  };
}

/**
 * The path of a bundle's file for a locale, relative to the area root: placeholders filled in, optional parts
 * kept only if all their placeholders have a value (the base file `default` has no locale value). Undefined
 * if the pattern cannot express it or the area would not read the path back as this bundle and locale.
 */
export function formatFilePattern(
  spec: FilePatternSpec,
  bundle: string,
  locale: LocaleCode,
): string | undefined {
  const localeValue = locale === BASE_FILE_LOCALE ? undefined : locale;
  // The fallback bundle's files leave out an optional bundle part, so that path is tried first.
  const bundleValues = bundle === spec.bundleName ? [undefined, bundle] : [bundle];
  for (const bundleValue of bundleValues) {
    const path = fillPattern(
      spec.files,
      new Map([
        ['{bundle}', bundleValue],
        ['{locale}', localeValue],
      ]),
    );
    if (path !== undefined && isPlainRelativePath(path) && readsBack(spec, path, bundle, locale)) {
      return path;
    }
  }
  return undefined;
}

/** The pattern with its placeholders filled in; undefined if a required placeholder has no value. */
function fillPattern(files: string, values: ReadonlyMap<string, string | undefined>): string | undefined {
  // One entry per open bracket level: the text so far and whether every placeholder in it had a value.
  const parts = [{ text: '', complete: true }];
  let rest = files;
  while (rest.length > 0) {
    const part = parts[parts.length - 1]!;
    const placeholder = rest.slice(0, 8);
    if (values.has(placeholder)) {
      const value = values.get(placeholder);
      part.text += value ?? '';
      part.complete &&= value !== undefined;
      rest = rest.slice(8);
      continue;
    }
    if (rest[0] === '[') {
      parts.push({ text: '', complete: true });
    } else if (rest[0] === ']' && parts.length > 1) {
      parts.pop();
      parts[parts.length - 1]!.text += part.complete ? part.text : '';
    } else {
      part.text += rest[0];
    }
    rest = rest.slice(1);
  }
  const [path] = parts;
  return path!.complete ? path!.text : undefined;
}

/** Whether the area reads `path` back as this bundle and locale. */
function readsBack(spec: FilePatternSpec, path: string, bundle: string, locale: LocaleCode): boolean {
  let match: PatternMatch | null = null;
  try {
    match = compileFilePattern(spec)(path);
  } catch {
    // An invalid pattern cannot describe any file.
  }
  return match?.bundle === bundle && match.locale === locale;
}

function toRegexSource(spec: FilePatternSpec): {
  source: string;
  bundle: 'required' | 'optional' | 'absent';
  hasLocale: boolean;
} {
  let source = '';
  let depth = 0;
  let bundle: 'required' | 'optional' | 'absent' = 'absent';
  let hasLocale = false;
  let rest = spec.files;

  while (rest.length > 0) {
    if (rest.startsWith('{bundle}') || rest.startsWith('{locale}')) {
      const isBundle = rest.startsWith('{bundle}');
      if (isBundle ? bundle !== 'absent' : hasLocale) {
        throw new SyntaxError(`File pattern "${spec.files}" may contain ${rest.slice(0, 8)} only once.`);
      }
      source += isBundle
        ? `(?<bundle>${spec.bundlePattern ?? DEFAULT_BUNDLE_PATTERN})`
        : `(?<locale>${spec.localePattern})`;
      if (isBundle) {
        bundle = depth > 0 ? 'optional' : 'required';
      } else {
        hasLocale = true;
      }
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
  return { source, bundle, hasLocale };
}

/**
 * The expression is embedded into the whole-path pattern: anchors would never match there and numbered
 * backreferences would point at the wrong group, so both are rejected along with invalid syntax.
 */
function assertEmbeddableRegex(source: string, name: string): void {
  try {
    new RegExp(source);
  } catch (error) {
    throw new SyntaxError(`${name} is not a valid regular expression: ${(error as Error).message}`, {
      cause: error,
    });
  }
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\') {
      if (/[1-9k]/.test(source[i + 1] ?? '')) {
        throw new SyntaxError(`${name} must not contain a backreference ("${source}").`);
      }
      i++;
    } else if (char === '[') {
      inClass = true;
    } else if (char === ']') {
      inClass = false;
    } else if (!inClass && (char === '^' || char === '$')) {
      throw new SyntaxError(
        `${name} must not contain an anchor (^ or $); it is embedded into the path pattern.`,
      );
    }
  }
}
