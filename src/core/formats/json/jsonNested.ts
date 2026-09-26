import { parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';
import { keyFromSegments } from '../../model/keys';
import { VALUE_FIELD } from '../../model/types';
import { decodeText } from '../../text/decode';
import { encodeText } from '../../text/encode';
import { DEFAULT_STYLE } from '../../text/style';
import { escapeBeyondLatin1 } from '../../text/unicodeEscape';
import type { FileProblem, FormatAdapter, ParsedEntry, ParsedFile, TextRange } from '../adapter';
import { applyJsonOps, emptyJsonObject } from './jsonWrite';

/** Nested JSON objects with string leaves, as used by ngx-translate (edu-sharing Angular i18n). */
export const jsonNestedAdapter: FormatAdapter = {
  id: 'json-nested',
  flatKeys: false,
  decode: decodeText,
  parse(doc): ParsedFile {
    const problems: FileProblem[] = doc.encoding === 'utf-8' ? [] : [{ code: 'not-utf8', range: [0, 0] }];
    // Angular's HttpClient yields null for an empty body instead of failing, so the file adds nothing.
    if (doc.text === '') {
      return { entries: [], problems, topLevelKeys: [] };
    }
    try {
      const parsed = parseObject(doc.text);
      return { ...parsed, problems: [...problems, ...parsed.problems] };
    } catch (error) {
      if (!(error instanceof RangeError)) {
        throw error;
      }
      // The call stack overflowed on nesting far deeper than any translation file: report, don't crash.
      problems.push({ code: 'parse-error', range: [0, 0], detail: 'TooDeep' });
      return { entries: [], problems, topLevelKeys: [] };
    }
  },
  applyOps: (doc, ops) => ({ ...doc, text: applyJsonOps(doc.text, ops) }),
  encode: (doc) =>
    encodeText(doc.encoding === 'latin-1' ? { ...doc, text: escapeBeyondLatin1(doc.text) } : doc),
  createEmpty: (style = DEFAULT_STYLE) => emptyJsonObject(style),
};

function parseObject(text: string): ParsedFile {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  const [firstError] = errors;
  if (firstError) {
    // Like JSON.parse, report the first error only: the errors after it come from the parser's recovery.
    const range: TextRange = [firstError.offset, firstError.offset + firstError.length];
    return {
      entries: [],
      problems: [{ code: 'parse-error', range, detail: printParseErrorCode(firstError.error) }],
      topLevelKeys: [],
    };
  }
  if (root?.type !== 'object') {
    const range: TextRange = root ? rangeOf(root) : [0, 0];
    return {
      entries: [],
      problems: [{ code: 'parse-error', range, detail: 'ObjectExpected' }],
      topLevelKeys: [],
    };
  }

  const entries = new Map<string, ParsedEntry>();
  const problems: FileProblem[] = [];
  const topLevel = effectiveProperties(root, [], problems);
  collect(topLevel, [], entries, problems);
  return { entries: [...entries.values()], problems, topLevelKeys: [...topLevel.keys()] };
}

/**
 * The properties of an object as JSON.parse sees them: a repeated key takes the last value
 * but keeps the position of its first occurrence. Every repetition is reported.
 */
function effectiveProperties(
  object: Node,
  path: readonly string[],
  problems: FileProblem[],
): Map<string, [Node, Node]> {
  const effective = new Map<string, [Node, Node]>();
  for (const property of object.children ?? []) {
    const [keyNode, valueNode] = property.children ?? [];
    if (!keyNode || !valueNode) {
      continue;
    }
    const name = keyNode.value as string;
    if (effective.has(name)) {
      problems.push({
        code: 'duplicate-key',
        range: rangeOf(keyNode),
        key: keyFromSegments([...path, name]),
      });
    }
    effective.set(name, [keyNode, valueNode]);
  }
  return effective;
}

function collect(
  properties: Map<string, [Node, Node]>,
  path: readonly string[],
  entries: Map<string, ParsedEntry>,
  problems: FileProblem[],
): void {
  for (const [name, [keyNode, valueNode]] of properties) {
    const segments = [...path, name];
    if (valueNode.type === 'object') {
      collect(effectiveProperties(valueNode, segments, problems), segments, entries, problems);
    } else if (valueNode.type === 'string') {
      const key = keyFromSegments(segments);
      entries.set(key.id, {
        key,
        fields: {
          [VALUE_FIELD]: {
            value: valueNode.value as string,
            valueRange: rangeOf(valueNode),
            keyRange: rangeOf(keyNode),
          },
        },
      });
    } else {
      problems.push({ code: 'non-string-value', range: rangeOf(valueNode), key: keyFromSegments(segments) });
    }
  }
}

function rangeOf(node: Node): TextRange {
  return [node.offset, node.offset + node.length];
}
