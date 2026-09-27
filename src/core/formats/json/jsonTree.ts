import { parseTree, type Node, type ParseError } from 'jsonc-parser';
import { EditError } from '../adapter';

// The tree of a JSON file as the writer reads it: which property a path names, the last of a repeated name as
// JSON.parse keeps it. What the writer changes in the text is jsonWrite.ts's.

/** A property of a JSON object with its key and value nodes. */
export interface Property {
  node: Node;
  key: Node;
  value: Node;
}

/** The tree of a file that holds a JSON object; an EditError (`unparsable`) for anything else. */
export function parseObject(text: string): Node {
  const errors: ParseError[] = [];
  let root: Node | undefined;
  try {
    root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    // As in the reader: the call stack overflowed on nesting far deeper than any translation file.
    throw new EditError('unparsable', 'The file is nested too deeply to be read.');
  }
  if (errors.length > 0 || root?.type !== 'object') {
    throw new EditError('unparsable', 'The file is not a valid JSON object.');
  }
  return root;
}

export function propertiesOf(object: Node): Property[] {
  return (object.children ?? []).flatMap((node) => {
    const [key, value] = node.children ?? [];
    return key && value ? [{ node, key, value }] : [];
  });
}

/** Finds the property of a path, as {@link findProperty} does. */
export type PropertyFinder = (segments: readonly string[]) => Property | undefined;

/**
 * Finds properties in the tree of `root` by name, each object read once: a run of texts in an object of many
 * properties then costs one pass over them, not one per text (10,000 texts of a flat object took 6.8 s, review of
 * audit P-07).
 */
export function propertyFinder(root: Node): PropertyFinder {
  const byName = new Map<Node, Map<unknown, Property>>();
  const named = (object: Node, name: string) => {
    let properties = byName.get(object);
    if (!properties) {
      // The last definition of a name wins, as in lastNamed.
      properties = new Map(propertiesOf(object).map((property) => [property.key.value, property]));
      byName.set(object, properties);
    }
    return properties.get(name);
  };
  return (segments) => {
    let object: Node | undefined = root;
    for (const segment of segments.slice(0, -1)) {
      const property: Property | undefined = object && named(object, segment);
      object = property?.value.type === 'object' ? property.value : undefined;
    }
    return object && named(object, segments[segments.length - 1]!);
  };
}

/** The definition that applies: with duplicated keys, JSON.parse keeps the last one. */
export function lastNamed(object: Node, name: string): Property | undefined {
  return propertiesOf(object)
    .filter((property) => property.key.value === name)
    .at(-1);
}

export function objectAt(root: Node, path: readonly string[]): Node | undefined {
  let object: Node | undefined = root;
  for (const segment of path) {
    const property: Property | undefined = object && lastNamed(object, segment);
    object = property?.value.type === 'object' ? property.value : undefined;
  }
  return object;
}

export function findProperty(root: Node, segments: readonly string[]): Property | undefined {
  const parent = objectAt(root, segments.slice(0, -1));
  return parent && lastNamed(parent, segments[segments.length - 1]!);
}

export function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}
