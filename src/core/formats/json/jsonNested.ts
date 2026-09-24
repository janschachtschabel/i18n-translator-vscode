import { parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';
import { keyFromSegments } from '../../model/keys';
import { VALUE_FIELD } from '../../model/types';
import { decodeText } from '../../text/decode';
import type { FileProblem, FormatAdapter, ParsedEntry, ParsedFile, TextRange } from '../adapter';

/** Nested JSON objects with string leaves, as used by ngx-translate (edu-sharing Angular i18n). */
export const jsonNestedAdapter: FormatAdapter = {
  id: 'json-nested',
  decode: decodeText,
  parse(doc): ParsedFile {
    const problems: FileProblem[] = [];
    if (doc.encoding !== 'utf-8') {
      problems.push({ code: 'not-utf8', range: [0, 0] });
    }

    const errors: ParseError[] = [];
    const root = parseTree(doc.text, errors, { disallowComments: true, allowTrailingComma: false });
    for (const error of errors) {
      problems.push({
        code: 'parse-error',
        range: [error.offset, error.offset + error.length],
        detail: printParseErrorCode(error.error),
      });
    }
    if (errors.length > 0) {
      return { entries: [], problems, topLevelKeys: [] };
    }
    if (root?.type !== 'object') {
      problems.push({ code: 'parse-error', range: root ? rangeOf(root) : [0, 0], detail: 'ObjectExpected' });
      return { entries: [], problems, topLevelKeys: [] };
    }

    const entries = new Map<string, ParsedEntry>();
    collect(root, [], entries, problems);
    const topLevelKeys = [...new Set(properties(root).map(([keyNode]) => keyNode.value as string))];
    return { entries: [...entries.values()], problems, topLevelKeys };
  },
};

function collect(
  object: Node,
  path: string[],
  entries: Map<string, ParsedEntry>,
  problems: FileProblem[],
): void {
  const seen = new Set<string>();
  for (const [keyNode, valueNode] of properties(object)) {
    const name = keyNode.value as string;
    const segments = [...path, name];
    if (seen.has(name)) {
      // JSON.parse keeps the last value, so the earlier value (or whole subtree) is gone at runtime.
      problems.push({ code: 'duplicate-key', range: rangeOf(keyNode), key: keyFromSegments(segments) });
      removeSubtree(entries, segments);
    }
    seen.add(name);

    if (valueNode.type === 'object') {
      collect(valueNode, segments, entries, problems);
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

/** Key and value node of every property of an object node. */
function properties(object: Node): [Node, Node][] {
  const pairs: [Node, Node][] = [];
  for (const property of object.children ?? []) {
    const [keyNode, valueNode] = property.children ?? [];
    if (keyNode && valueNode) {
      pairs.push([keyNode, valueNode]);
    }
  }
  return pairs;
}

function removeSubtree(entries: Map<string, ParsedEntry>, prefix: readonly string[]): void {
  for (const [id, entry] of entries) {
    if (prefix.every((segment, index) => entry.key.segments[index] === segment)) {
      entries.delete(id);
    }
  }
}

function rangeOf(node: Node): TextRange {
  return [node.offset, node.offset + node.length];
}
