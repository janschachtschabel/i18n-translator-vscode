import { parseTree, type Node, type ParseError } from 'jsonc-parser';
import { displayKey, keyFromSegments, type EntryKey } from '../../model/keys';
import { applyEdits } from '../../text/edits';
import { lineStartAt } from '../../text/lineIndex';
import { detectStyle, type TextStyle } from '../../text/style';
import { escapeUnits } from '../../text/unicodeEscape';
import { EditError, type FileOp } from '../adapter';

/** A property of a JSON object with its key and value nodes. */
interface Property {
  node: Node;
  key: Node;
  value: Node;
}

/**
 * Applies the operations one after another and re-reads the text in between. Only the affected lines change:
 * new lines copy the indentation of their sibling, and nothing else is reformatted.
 */
export function applyJsonOps(text: string, ops: readonly FileOp[]): string {
  const style = detectStyle(text);
  let current = text;
  for (const op of ops) {
    // An empty file has no entries (see the reader); one with only whitespace is a syntax error.
    current = applyOp(current === '' ? emptyJsonObject(style) : current, op, style);
  }
  return current;
}

export function emptyJsonObject(style: TextStyle): string {
  return `{}${style.finalNewline ? style.eol : ''}`;
}

/** A JSON string literal. Line and paragraph separators are escaped, because editors offer to remove them. */
function jsonString(value: string): string {
  return escapeUnits(JSON.stringify(value), (unit) => unit === 0x2028 || unit === 0x2029);
}

function applyOp(text: string, op: FileOp, style: TextStyle): string {
  const root = parseObject(text);
  switch (op.kind) {
    case 'set':
      return setValue(text, root, op.key, op.value);
    case 'insert':
      return insertEntry(text, root, op.key, op.value, op.first ? 'first' : op.after, style);
    case 'delete':
      return deleteEntry(text, root, op.key);
    case 'rename':
      return renameEntry(text, root, op.from, op.to, style);
  }
}

function parseObject(text: string): Node {
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

function setValue(text: string, root: Node, key: EntryKey, value: string): string {
  const property = findProperty(root, key.segments);
  if (!property) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`, key);
  }
  if (property.value.type !== 'string') {
    throw new EditError('path-conflict', `${displayKey(key)} is not a text.`, key);
  }
  return applyEdits(text, [
    { offset: property.value.offset, length: property.value.length, content: jsonString(value) },
  ]);
}

function insertEntry(
  text: string,
  root: Node,
  key: EntryKey,
  value: string,
  place: EntryKey | 'first' | undefined,
  style: TextStyle,
): string {
  // Walk down as far as the parent objects exist; the rest of the path is created.
  let object = root;
  let depth = 0;
  while (depth < key.segments.length - 1) {
    const property = lastNamed(object, key.segments[depth]!);
    if (!property) {
      break;
    }
    if (property.value.type !== 'object') {
      const blocker = keyFromSegments(key.segments.slice(0, depth + 1));
      throw new EditError('path-conflict', `${displayKey(blocker)} is not an object.`, key, blocker);
    }
    object = property.value;
    depth++;
  }
  const [name, ...below] = key.segments.slice(depth) as [string, ...string[]];
  const existing = below.length === 0 ? lastNamed(object, name) : undefined;
  if (existing) {
    throw existsError(key, existing);
  }
  const sibling =
    place === 'first'
      ? place
      : place && samePath(place.segments.slice(0, -1), key.segments.slice(0, depth))
        ? lastNamed(object, place.segments[place.segments.length - 1]!)
        : undefined;
  return insertProperty(
    text,
    object,
    name,
    (indent) => renderValue(below, value, indent, style),
    sibling,
    style,
  );
}

/**
 * Inserts `"name": value` into an object: before the first property, after the sibling (or the last property)
 * with its indentation, or into an empty object one level deeper than the object's line. `renderValue` gets the
 * indentation of the new line, or undefined for objects written on one line.
 */
function insertProperty(
  text: string,
  object: Node,
  name: string,
  renderValue: (indent: string | undefined) => string,
  sibling: Property | 'first' | undefined,
  style: TextStyle,
): string {
  const properties = propertiesOf(object);
  const first = properties[0];
  if (sibling === 'first' && first) {
    // The new line takes the comma, so that the line of the old first property stays as it is.
    const prefix = text.slice(lineStartAt(text, first.node.offset), first.node.offset);
    const content = /\S/.test(prefix)
      ? `${jsonString(name)}: ${renderValue(undefined)}, `
      : `${jsonString(name)}: ${renderValue(prefix)},${style.eol}${prefix}`;
    return applyEdits(text, [{ offset: first.node.offset, length: 0, content }]);
  }
  const anchor = (sibling === 'first' ? undefined : sibling) ?? properties[properties.length - 1];
  if (!anchor) {
    const outer = indentationOfLine(text, object.offset);
    const inner = outer + style.indent;
    const content = `${style.eol}${inner}${jsonString(name)}: ${renderValue(inner)}${style.eol}${outer}`;
    return applyEdits(text, [{ offset: object.offset + 1, length: object.length - 2, content }]);
  }
  const prefix = text.slice(lineStartAt(text, anchor.node.offset), anchor.node.offset);
  const inline = /\S/.test(prefix);
  const line = `${inline ? ' ' : style.eol + prefix}${jsonString(name)}: ${renderValue(inline ? undefined : prefix)}`;
  const valueEnd = anchor.value.offset + anchor.value.length;
  const comma = nextNonSpace(text, valueEnd);
  return text[comma] === ','
    ? applyEdits(text, [{ offset: comma + 1, length: 0, content: `${line},` }])
    : applyEdits(text, [{ offset: valueEnd, length: 0, content: `,${line}` }]);
}

/** The value of a new property: the text itself, or the objects of the remaining path around it. */
function renderValue(
  path: readonly string[],
  value: string,
  indent: string | undefined,
  style: TextStyle,
): string {
  const [name, ...below] = path;
  if (name === undefined) {
    return jsonString(value);
  }
  if (indent === undefined) {
    return `{${jsonString(name)}: ${renderValue(below, value, undefined, style)}}`;
  }
  const inner = indent + style.indent;
  return `{${style.eol}${inner}${jsonString(name)}: ${renderValue(below, value, inner, style)}${style.eol}${indent}}`;
}

/** Removes every definition of the key; objects that become empty go too, except the top level. */
function deleteEntry(text: string, root: Node, key: EntryKey): string {
  const property = findProperty(root, key.segments);
  if (!property) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`, key);
  }
  if (property.value.type !== 'string') {
    throw new EditError('path-conflict', `${displayKey(key)} is not a text.`, key);
  }
  // The highest level at which the path would leave an empty object behind.
  let level = key.segments.length - 1;
  while (level > 0) {
    const parent = objectAt(root, key.segments.slice(0, level))!;
    if (!propertiesOf(parent).every((candidate) => candidate.key.value === key.segments[level])) {
      break;
    }
    level--;
  }
  return removeEvery(text, root, key.segments.slice(0, level), key.segments[level]!);
}

/** Removes every definition of `name` from the object at `path`; `root` is the tree of `text`. */
function removeEvery(text: string, root: Node, path: readonly string[], name: string): string {
  let current = text;
  let object = objectAt(root, path)!;
  for (;;) {
    const named = propertiesOf(object).filter((property) => property.key.value === name);
    const doomed = named.at(-1);
    if (!doomed) {
      return current;
    }
    current = removeProperty(current, object, doomed);
    if (named.length === 1) {
      return current;
    }
    // The offsets have changed: read the text again for the next definition.
    object = objectAt(parseObject(current), path)!;
  }
}

function removeProperty(text: string, object: Node, property: Property): string {
  const properties = propertiesOf(object);
  const index = properties.findIndex((candidate) => candidate.node === property.node);
  if (properties.length === 1) {
    return applyEdits(text, [{ offset: object.offset + 1, length: object.length - 2, content: '' }]);
  }
  const next = properties[index + 1];
  if (next) {
    // The whole line including its comma, or on one-line objects the property up to the next one.
    const ownLines = onOwnLine(text, property.node) && onOwnLine(text, next.node);
    const start = ownLines ? lineStartAt(text, property.node.offset) : property.node.offset;
    const end = ownLines ? lineStartAt(text, next.node.offset) : next.node.offset;
    return applyEdits(text, [{ offset: start, length: end - start, content: '' }]);
  }
  // The last property: from the end of the previous value, which takes the comma with it.
  const previous = properties[index - 1]!;
  const start = previous.value.offset + previous.value.length;
  return applyEdits(text, [
    { offset: start, length: property.node.offset + property.node.length - start, content: '' },
  ]);
}

function renameEntry(text: string, root: Node, from: EntryKey, to: EntryKey, style: TextStyle): string {
  const property = findProperty(root, from.segments);
  if (!property) {
    throw new EditError('missing-key', `${displayKey(from)} does not exist in this file.`, from);
  }
  if (property.value.type !== 'string') {
    throw new EditError('path-conflict', `${displayKey(from)} is not a text.`, from);
  }
  if (from.id === to.id) {
    return text;
  }
  if (samePath(from.segments.slice(0, -1), to.segments.slice(0, -1))) {
    const parent = objectAt(root, to.segments.slice(0, -1))!;
    const existing = lastNamed(parent, to.segments[to.segments.length - 1]!);
    if (existing) {
      throw existsError(to, existing);
    }
    const content = jsonString(to.segments[to.segments.length - 1]!);
    const renamed = applyEdits(text, [{ offset: property.key.offset, length: property.key.length, content }]);
    // Earlier definitions of the old name were hidden by the renamed one; they must not come back.
    return removeEvery(
      renamed,
      parseObject(renamed),
      from.segments.slice(0, -1),
      from.segments[from.segments.length - 1]!,
    );
  }
  // Insert first: it checks the target path, and a shared parent object keeps its place.
  const inserted = insertEntry(text, root, to, property.value.value as string, undefined, style);
  return deleteEntry(inserted, parseObject(inserted), from);
}

/** A new text cannot replace an object (a path conflict) nor any other value (the key exists). */
function existsError(key: EntryKey, existing: Property): EditError {
  return existing.value.type === 'object'
    ? new EditError('path-conflict', `${displayKey(key)} is an object in this file.`, key)
    : new EditError('key-exists', `${displayKey(key)} already exists in this file.`, key);
}

function propertiesOf(object: Node): Property[] {
  return (object.children ?? []).flatMap((node) => {
    const [key, value] = node.children ?? [];
    return key && value ? [{ node, key, value }] : [];
  });
}

/** The definition that applies: with duplicated keys, JSON.parse keeps the last one. */
function lastNamed(object: Node, name: string): Property | undefined {
  return propertiesOf(object)
    .filter((property) => property.key.value === name)
    .at(-1);
}

function objectAt(root: Node, path: readonly string[]): Node | undefined {
  let object: Node | undefined = root;
  for (const segment of path) {
    const property: Property | undefined = object && lastNamed(object, segment);
    object = property?.value.type === 'object' ? property.value : undefined;
  }
  return object;
}

function findProperty(root: Node, segments: readonly string[]): Property | undefined {
  const parent = objectAt(root, segments.slice(0, -1));
  return parent && lastNamed(parent, segments[segments.length - 1]!);
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

function indentationOfLine(text: string, offset: number): string {
  return /^[ \t]*/.exec(text.slice(lineStartAt(text, offset)))![0];
}

function onOwnLine(text: string, node: Node): boolean {
  return !/\S/.test(text.slice(lineStartAt(text, node.offset), node.offset));
}

function nextNonSpace(text: string, offset: number): number {
  let index = offset;
  while (index < text.length && /\s/.test(text[index]!)) {
    index++;
  }
  return index;
}
