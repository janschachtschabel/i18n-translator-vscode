import { parseTree, type Node, type ParseError } from 'jsonc-parser';
import { displayKey, type EntryKey } from '../../model/keys';
import { applyEdits } from '../../text/edits';
import { detectStyle, type TextStyle } from '../../text/style';
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

/**
 * For a file read as ISO-8859-1: writes the characters it cannot hold as `\uXXXX`. The read text has none of
 * them, so they can only come from string literals written here, where the escape is exact.
 */
export function escapeBeyondLatin1(text: string): string {
  return escapeUnits(text, (unit) => unit > 0xff);
}

/** A JSON string literal. Line and paragraph separators are escaped, because editors offer to remove them. */
function jsonString(value: string): string {
  return escapeUnits(JSON.stringify(value), (unit) => unit === 0x2028 || unit === 0x2029);
}

/** Writes every UTF-16 code unit for which `escape` holds as `\uXXXX`. */
function escapeUnits(text: string, escape: (unit: number) => boolean): string {
  let result = '';
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (escape(unit)) {
      result += `${text.slice(start, index)}\\u${unit.toString(16).padStart(4, '0')}`;
      start = index + 1;
    }
  }
  return result + text.slice(start);
}

function applyOp(text: string, op: FileOp, style: TextStyle): string {
  const root = parseObject(text);
  switch (op.kind) {
    case 'set':
      return setValue(text, root, op.key, op.value);
    case 'insert':
      return insertEntry(text, root, op.key, op.value, op.after, style);
    case 'delete':
      return deleteEntry(text, op.key);
    case 'rename':
      return renameEntry(text, root, op.from, op.to, style);
  }
}

function parseObject(text: string): Node {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (errors.length > 0 || root?.type !== 'object') {
    throw new EditError('unparsable', 'The file is not a valid JSON object.');
  }
  return root;
}

function setValue(text: string, root: Node, key: EntryKey, value: string): string {
  const property = findProperty(root, key.segments);
  if (!property) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`);
  }
  if (property.value.type !== 'string') {
    throw new EditError('path-conflict', `${displayKey(key)} is not a text.`);
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
  after: EntryKey | undefined,
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
      throw new EditError('path-conflict', `${key.segments.slice(0, depth + 1).join('.')} is not an object.`);
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
    after && samePath(after.segments.slice(0, -1), key.segments.slice(0, depth))
      ? lastNamed(object, after.segments[after.segments.length - 1]!)
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
 * Inserts `"name": value` into an object: after the sibling (or the last property) with its indentation, or
 * into an empty object one level deeper than the object's line. `renderValue` gets the indentation of the new
 * line, or undefined for objects written on one line.
 */
function insertProperty(
  text: string,
  object: Node,
  name: string,
  renderValue: (indent: string | undefined) => string,
  sibling: Property | undefined,
  style: TextStyle,
): string {
  const properties = propertiesOf(object);
  const anchor = sibling ?? properties[properties.length - 1];
  if (!anchor) {
    const outer = indentationOfLine(text, object.offset);
    const inner = outer + style.indent;
    const content = `${style.eol}${inner}${jsonString(name)}: ${renderValue(inner)}${style.eol}${outer}`;
    return applyEdits(text, [{ offset: object.offset + 1, length: object.length - 2, content }]);
  }
  const prefix = text.slice(lineStart(text, anchor.node.offset), anchor.node.offset);
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
function deleteEntry(text: string, key: EntryKey): string {
  const property = findProperty(parseObject(text), key.segments);
  if (!property) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`);
  }
  if (property.value.type !== 'string') {
    throw new EditError('path-conflict', `${displayKey(key)} is not a text.`);
  }
  // The highest level at which the path would leave an empty object behind.
  let level = key.segments.length - 1;
  while (level > 0) {
    const parent = objectAt(parseObject(text), key.segments.slice(0, level))!;
    if (!propertiesOf(parent).every((candidate) => candidate.key.value === key.segments[level])) {
      break;
    }
    level--;
  }
  return removeEvery(text, key.segments.slice(0, level), key.segments[level]!);
}

/** Removes every definition of `name` from the object at `path`. */
function removeEvery(text: string, path: readonly string[], name: string): string {
  let current = text;
  for (;;) {
    const object = objectAt(parseObject(current), path)!;
    const doomed = lastNamed(object, name);
    if (!doomed) {
      return current;
    }
    current = removeProperty(current, object, doomed);
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
    const start = ownLines ? lineStart(text, property.node.offset) : property.node.offset;
    const end = ownLines ? lineStart(text, next.node.offset) : next.node.offset;
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
    throw new EditError('missing-key', `${displayKey(from)} does not exist in this file.`);
  }
  if (property.value.type !== 'string') {
    throw new EditError('path-conflict', `${displayKey(from)} is not a text.`);
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
    return removeEvery(renamed, from.segments.slice(0, -1), from.segments[from.segments.length - 1]!);
  }
  // Insert first: it checks the target path, and a shared parent object keeps its place.
  const inserted = insertEntry(text, root, to, property.value.value as string, undefined, style);
  return deleteEntry(inserted, from);
}

/** A new text cannot replace an object (a path conflict) nor any other value (the key exists). */
function existsError(key: EntryKey, existing: Property): EditError {
  return existing.value.type === 'object'
    ? new EditError('path-conflict', `${displayKey(key)} is an object in this file.`)
    : new EditError('key-exists', `${displayKey(key)} already exists in this file.`);
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

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

function indentationOfLine(text: string, offset: number): string {
  return /^[ \t]*/.exec(text.slice(lineStart(text, offset)))![0];
}

function onOwnLine(text: string, node: Node): boolean {
  return !/\S/.test(text.slice(lineStart(text, node.offset), node.offset));
}

function nextNonSpace(text: string, offset: number): number {
  let index = offset;
  while (index < text.length && /\s/.test(text[index]!)) {
    index++;
  }
  return index;
}
