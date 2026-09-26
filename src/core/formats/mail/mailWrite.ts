import { displayKey, type EntryKey } from '../../model/keys';
import type { DecodedText } from '../../text/decode';
import { applyEdits, type TextEdit } from '../../text/edits';
import { detectStyle } from '../../text/style';
import { EditError, type FileOp, type TextRange } from '../adapter';
import { MAIL_FIELDS, readMail, type MailField, type MailFieldInfo, type MailTemplateInfo } from './mailRead';
import type { XmlElement } from './xmlTokens';
import { cdataInner, escapeAttribute, fieldBody, type Writer } from './xmlText';

/** Where a new element goes among the element children of its parent. */
type Place = XmlElement | 'first' | undefined;

/**
 * Applies the operations one after another and re-reads the text in between. A template is an object and its
 * subject and message are texts, as in nested JSON: only the affected elements and lines change, and new lines
 * take the indentation of their neighbors.
 */
export function applyMailOps(doc: DecodedText, ops: readonly FileOp[]): string {
  const writer: Writer = { style: detectStyle(doc.text), latin1: doc.encoding === 'latin-1' };
  let current = doc.text;
  for (const op of ops) {
    current = applyOp(current, op, writer);
  }
  return current;
}

function applyOp(text: string, op: FileOp, writer: Writer): string {
  switch (op.kind) {
    case 'set':
      return setField(text, op.key, op.value, writer);
    case 'insert':
      return insertField(text, op.key, op.value, op.first ? 'first' : op.after, writer);
    case 'delete':
      return deleteField(text, op.key);
    case 'rename':
      return renameField(text, op.from, op.to, writer);
  }
}

function setField(text: string, key: EntryKey, value: string, writer: Writer): string {
  const { id, field } = partsOf(key);
  const info = firstField(effectiveTemplate(read(text), id), field);
  if (!info) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`, key);
  }
  if (info.value === undefined) {
    throw new EditError('path-conflict', `${displayKey(key)} is not a text.`, key);
  }
  switch (info.mode) {
    case 'cdata':
      return replace(text, info.valueRange, cdataInner(value, writer));
    case 'text':
      return replace(text, info.valueRange, fieldBody(field, value, writer));
    case 'empty':
      return replace(text, info.element.range, fieldElement(field, value, writer));
  }
}

/** Into its template after the anchor (a field of it, or `first`), or as a new template after the anchor template. */
function insertField(
  text: string,
  key: EntryKey,
  value: string,
  place: EntryKey | 'first' | undefined,
  writer: Writer,
): string {
  const { id, field } = partsOf(key);
  const templates = read(text);
  const template = effectiveTemplate(templates, id);
  const element = () => fieldElement(field, value, writer);
  if (template) {
    if (firstField(template, field)) {
      throw new EditError('key-exists', `${displayKey(key)} already exists in this file.`, key);
    }
    const sibling =
      place === 'first'
        ? 'first'
        : place?.segments.length === 2 && place.segments[0] === id
          ? firstField(template, place.segments[1] as MailField)?.element
          : undefined;
    return insertChild(text, template.element, element, sibling, writer);
  }
  const root = rootOf(text);
  const anchor =
    place === 'first' ? 'first' : place && effectiveTemplate(templates, place.segments[0]!)?.element;
  const { name, context } = splitId(id);
  const start = `<template name="${escapeAttribute(name, writer)}"${
    context === undefined ? '' : ` context="${escapeAttribute(context, writer)}"`
  }>`;
  const newTemplate = (indent: string) => {
    const inner = indent + writer.style.indent;
    const eol = writer.style.eol;
    return `${start}${eol}${inner}${element()}${eol}${indent}</template>`;
  };
  return insertChild(text, root, newTemplate, anchor, writer);
}

/** Removes every repetition of the field; a template left without elements goes as a whole. */
function deleteField(text: string, key: EntryKey): string {
  const { id, field } = partsOf(key);
  const template = effectiveTemplate(read(text), id);
  const doomed = template?.fields.filter((info) => info.field === field) ?? [];
  if (!template || doomed.length === 0) {
    throw new EditError('missing-key', `${displayKey(key)} does not exist in this file.`, key);
  }
  const rest = template.element.children.filter(
    (child) => child.kind === 'element' && !doomed.some((info) => info.element === child),
  );
  if (rest.length === 0) {
    return applyEdits(text, [removal(text, template.element)]);
  }
  return applyEdits(
    text,
    doomed.map((info) => removal(text, info.element)),
  );
}

/**
 * Within a template the element changes its name, and hidden repetitions of the old name go (they would come
 * back); into another template the field moves, as a nested JSON text moves to another object.
 */
function renameField(text: string, from: EntryKey, to: EntryKey, writer: Writer): string {
  const source = partsOf(from);
  const target = partsOf(to);
  const templates = read(text);
  const template = effectiveTemplate(templates, source.id);
  const info = firstField(template, source.field);
  if (!template || !info) {
    throw new EditError('missing-key', `${displayKey(from)} does not exist in this file.`, from);
  }
  if (info.value === undefined) {
    throw new EditError('path-conflict', `${displayKey(from)} is not a text.`, from);
  }
  if (from.id === to.id) {
    return text;
  }
  if (firstField(effectiveTemplate(templates, target.id), target.field)) {
    throw new EditError('key-exists', `${displayKey(to)} already exists in this file.`, to);
  }
  if (source.id !== target.id) {
    const inserted = insertField(text, to, info.value, undefined, writer);
    return deleteField(inserted, from);
  }
  const { element } = info;
  const nameAt = (offset: number): TextEdit => ({
    offset,
    length: source.field.length,
    content: target.field,
  });
  const edits = [nameAt(element.range[0] + 1)];
  if (!element.selfClosing) {
    edits.push(nameAt(element.content[1] + 2));
  }
  const hidden = template.fields.filter((other) => other.field === source.field && other !== info);
  return applyEdits(text, [...edits, ...hidden.map((other) => removal(text, other.element))]);
}

/**
 * Inserts a new element into `parent`: before its first element (`first`), after `place`, or after its last
 * element, each time on a line of its own with the indentation of that neighbor. Into a parent without elements
 * the new one goes on its own line, one level deeper than the parent. `render` gets the indentation of the line.
 */
function insertChild(
  text: string,
  parent: XmlElement,
  render: (indent: string) => string,
  place: Place,
  writer: Writer,
): string {
  const eol = writer.style.eol;
  const elements = parent.children.filter((child): child is XmlElement => child.kind === 'element');
  const first = elements[0];
  if (place === 'first' && first) {
    const indent = indentBefore(text, first.range[0]);
    return indent === undefined
      ? insertAt(text, first.range[0], render(''))
      : insertAt(text, first.range[0], render(indent) + eol + indent);
  }
  const anchor = (place === 'first' ? undefined : place) ?? elements[elements.length - 1];
  if (anchor) {
    const indent = indentBefore(text, anchor.range[0]);
    return indent === undefined
      ? insertAt(text, anchor.range[1], render(''))
      : insertAt(text, anchor.range[1], eol + indent + render(indent));
  }
  const outer = indentOfLine(text, parent.range[0]);
  const inner = outer + writer.style.indent;
  if (parent.selfClosing) {
    const openTag = text.slice(parent.range[0], parent.range[1] - 2).trimEnd();
    return replace(
      text,
      parent.range,
      `${openTag}>${eol}${inner}${render(inner)}${eol}${outer}</${parent.name}>`,
    );
  }
  const endTag = parent.content[1];
  const endTagIndent = indentBefore(text, endTag);
  return endTagIndent === undefined
    ? insertAt(text, endTag, `${eol}${inner}${render(inner)}${eol}${outer}`)
    : insertAt(text, lineStart(text, endTag), `${inner}${render(inner)}${eol}`);
}

/** The element, or its whole line with the line break when nothing else stands on it. */
function removal(text: string, element: XmlElement): TextEdit {
  const [start, end] = element.range;
  const from = lineStart(text, start);
  const lineEnd = text.slice(end).search(/\r?\n|$/);
  const ownLine = !/\S/.test(text.slice(from, start)) && !/\S/.test(text.slice(end, end + lineEnd));
  if (!ownLine) {
    return { offset: start, length: end - start, content: '' };
  }
  const breakLength = text.startsWith('\r\n', end + lineEnd) ? 2 : text[end + lineEnd] === '\n' ? 1 : 0;
  return { offset: from, length: end + lineEnd + breakLength - from, content: '' };
}

function fieldElement(field: MailField, value: string, writer: Writer): string {
  return `<${field}>${fieldBody(field, value, writer)}</${field}>`;
}

function read(text: string): MailTemplateInfo[] {
  const result = readMail(text);
  if (!result.ok) {
    throw new EditError('unparsable', 'The file is not a valid list of mail templates.');
  }
  return result.templates;
}

function rootOf(text: string): XmlElement {
  const result = readMail(text);
  if (!result.ok) {
    throw new EditError('unparsable', 'The file is not a valid list of mail templates.');
  }
  return result.root;
}

/** The template edu-sharing uses: the last of those with the id. */
function effectiveTemplate(templates: readonly MailTemplateInfo[], id: string): MailTemplateInfo | undefined {
  return templates.filter((template) => template.id === id).at(-1);
}

/** The field edu-sharing reads: the first of its name in the template. */
function firstField(template: MailTemplateInfo | undefined, field: MailField): MailFieldInfo | undefined {
  return template?.fields.find((info) => info.field === field);
}

function partsOf(key: EntryKey): { id: string; field: MailField } {
  const [id, field] = key.segments;
  if (key.segments.length !== 2 || !(MAIL_FIELDS as readonly string[]).includes(field!)) {
    throw new RangeError(`A mail template key is [template, subject or message]: ${displayKey(key)}`);
  }
  return { id: id!, field: field as MailField };
}

/** `name@context` names the template of a context; the context follows the last `@`. */
function splitId(id: string): { name: string; context?: string } {
  const at = id.lastIndexOf('@');
  return at > 0 ? { name: id.slice(0, at), context: id.slice(at + 1) } : { name: id };
}

/** The white space from the start of the line to `offset`, or undefined if something else stands there. */
function indentBefore(text: string, offset: number): string | undefined {
  const before = text.slice(lineStart(text, offset), offset);
  return /^[ \t]*$/.test(before) ? before : undefined;
}

function indentOfLine(text: string, offset: number): string {
  return /^[ \t]*/.exec(text.slice(lineStart(text, offset)))![0];
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

function insertAt(text: string, offset: number, content: string): string {
  return applyEdits(text, [{ offset, length: 0, content }]);
}

function replace(text: string, [start, end]: TextRange, content: string): string {
  return applyEdits(text, [{ offset: start, length: end - start, content }]);
}
