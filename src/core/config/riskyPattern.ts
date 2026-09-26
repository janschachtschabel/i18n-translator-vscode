const MAX_PATTERN_LENGTH = 1000;

/** `*`, `+`, `?` or `{n}`, `{n,}`, `{n,m}`, each possibly lazy; group 2 is set for `{n,…}`, group 3 is its maximum. */
const QUANTIFIER = /(?:[*+?]|\{(\d+)(,(\d*))?\})\??/y;

/** A group while it is scanned. */
interface Group {
  /** Whether one of its alternatives starts with a repeated part. */
  startsRepeated: boolean;
  /** Whether the next atom starts an alternative. */
  atStart: boolean;
}

/**
 * Why a regular expression from the settings is refused, or undefined if it is not: it is very long, or a group
 * repeated without bound has an alternative that starts with a repeated part, like `(a+)+` or `(\s*\w+)*`. The
 * extension host runs the expressions on every index run, and such a group can take exponential time.
 *
 * simplify: other exponential forms, such as overlapping alternatives in `(a|aa)+`, pass. The settings come from
 * a trusted workspace; a full analysis would need a regex parser.
 */
export function riskyPattern(source: string): string | undefined {
  if (source.length > MAX_PATTERN_LENGTH) {
    return `it is longer than ${MAX_PATTERN_LENGTH} characters`;
  }
  const groups: Group[] = [{ startsRepeated: false, atStart: true }];
  // The atom a quantifier would repeat: whether it started an alternative, and the group it was, if one.
  let last: { first: boolean; group?: Group } | undefined;
  let index = 0;
  while (index < source.length) {
    const current = groups.at(-1)!;
    QUANTIFIER.lastIndex = index;
    const quantifier = last && QUANTIFIER.exec(source);
    if (quantifier) {
      const unbounded = /^[*+]/.test(quantifier[0]) || quantifier[3] === '';
      if (unbounded && last!.group?.startsRepeated) {
        return 'a repeated group starts with a repeated part, which can take exponential time';
      }
      current.startsRepeated ||= last!.first;
      last = undefined;
      index += quantifier[0].length;
      continue;
    }
    const char = source[index]!;
    if (char === '(') {
      groups.push({ startsRepeated: false, atStart: true });
      last = undefined;
      index += groupOpeningLength(source, index);
    } else if (char === ')' && groups.length > 1) {
      const group = groups.pop()!;
      const parent = groups.at(-1)!;
      last = { first: parent.atStart, group };
      // A group that starts with a repeated part lets the alternative it starts start with one too.
      parent.startsRepeated ||= parent.atStart && group.startsRepeated;
      parent.atStart = false;
      index++;
    } else if (char === '|') {
      current.atStart = true;
      last = undefined;
      index++;
    } else {
      last = { first: current.atStart };
      current.atStart = false;
      index += char === '\\' ? escapeLength(source, index) : char === '[' ? classLength(source, index) : 1;
    }
  }
  return undefined;
}

/** `(`, `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!`, `(?<name>` or a modifier group such as `(?i:`. */
function groupOpeningLength(source: string, start: number): number {
  if (source[start + 1] !== '?') {
    return 1;
  }
  const kind = source[start + 2];
  if (kind === ':' || kind === '=' || kind === '!') {
    return 3;
  }
  if (kind === '<') {
    return source[start + 3] === '=' || source[start + 3] === '!' ? 4 : lengthUpTo(source, start, '>');
  }
  return lengthUpTo(source, start, ':');
}

/** An escape: `\u{…}`, `\p{…}`, `\k<…>`, `\uXXXX`, `\xXX`, `\cX` or a backslash and one character. */
function escapeLength(source: string, start: number): number {
  const kind = source[start + 1];
  if ((kind === 'u' || kind === 'p' || kind === 'P') && source[start + 2] === '{') {
    return lengthUpTo(source, start, '}');
  }
  if (kind === 'k' && source[start + 2] === '<') {
    return lengthUpTo(source, start, '>');
  }
  return kind === 'u' ? 6 : kind === 'x' ? 4 : kind === 'c' ? 3 : 2;
}

/** A character class, up to its closing bracket; `]` right after `[` or `[^` closes it too, as in JavaScript. */
function classLength(source: string, start: number): number {
  let index = source[start + 1] === '^' ? start + 2 : start + 1;
  while (index < source.length && source[index] !== ']') {
    index += source[index] === '\\' ? 2 : 1;
  }
  return index + 1 - start;
}

/** The length from `start` up to and including the next `end`, or to the end of the source. */
function lengthUpTo(source: string, start: number, end: string): number {
  const found = source.indexOf(end, start);
  return (found === -1 ? source.length : found + 1) - start;
}
