import { keyFromSegments } from '../../model/keys';
import { VALUE_FIELD } from '../../model/types';
import type { FileProblem, ParsedEntry, ParsedFile, TextRange } from '../adapter';
import { decodeEntities, parseXml, type XmlCData, type XmlElement, type XmlNode } from './xmlTokens';

/** The translatable parts of a template; other elements (the style sheet) are no entries. */
export const MAIL_FIELDS = ['subject', 'message'] as const;
export type MailField = (typeof MAIL_FIELDS)[number];

/** How a field holds its text, which decides how a new text is written. */
export type FieldMode = 'cdata' | 'text' | 'empty';

export interface MailFieldInfo {
  field: MailField;
  element: XmlElement;
  /** The text as edu-sharing reads it, without layout; undefined if the field holds elements or comments. */
  value: string | undefined;
  /** The part of the text a new value replaces: the CDATA content or the element content, without layout. */
  valueRange: TextRange;
  mode: FieldMode;
}

export interface MailTemplateInfo {
  element: XmlElement;
  /** `name`, or `name@context` for a template of one context. */
  id: string;
  /** Every subject and message element in file order, repetitions included. */
  fields: MailFieldInfo[];
}

export type MailReadResult =
  { ok: true; root: XmlElement; templates: MailTemplateInfo[] } | { ok: false; problem: FileProblem };

/**
 * Entries, problems and template ids of a mail template file, read as edu-sharing's `MailTemplate` reads it: a
 * template is found by name and context, the last of two with the same id wins; within a template the first
 * subject or message counts. The key of an entry is `[template, field]`.
 */
export function parseMail(text: string): ParsedFile {
  const read = readMail(text);
  if (!read.ok) {
    return { entries: [], problems: [read.problem], topLevelKeys: [] };
  }
  const problems: FileProblem[] = [];
  const effective = new Map<string, MailTemplateInfo>();
  for (const template of read.templates) {
    if (effective.has(template.id)) {
      problems.push({
        code: 'duplicate-key',
        range: nameRange(template),
        key: keyFromSegments([template.id]),
      });
    }
    // A later template replaces the earlier one as a whole, but the id keeps its place.
    effective.set(template.id, template);
  }
  const entries: ParsedEntry[] = [];
  for (const template of effective.values()) {
    const seen = new Set<MailField>();
    for (const info of template.fields) {
      const key = keyFromSegments([template.id, info.field]);
      if (seen.has(info.field)) {
        problems.push({ code: 'duplicate-key', range: info.element.range, key });
        continue;
      }
      seen.add(info.field);
      if (info.value === undefined) {
        problems.push({ code: 'non-string-value', range: info.element.range, key });
        continue;
      }
      const start = info.element.range[0];
      entries.push({
        key,
        fields: {
          [VALUE_FIELD]: {
            value: info.value,
            keyRange: [start, start + 1 + info.field.length],
            valueRange: info.valueRange,
          },
        },
      });
    }
  }
  return { entries, problems, topLevelKeys: [...effective.keys()] };
}

/** The templates of the file in file order, repetitions included; a syntax error or another root is a problem. */
export function readMail(text: string): MailReadResult {
  const xml = parseXml(text);
  if (!xml.ok) {
    return { ok: false, problem: { code: 'parse-error', range: xml.range, detail: xml.detail } };
  }
  const { root } = xml;
  if (root.name !== 'templates') {
    const at = root.range[0];
    return {
      ok: false,
      problem: { code: 'parse-error', range: [at, at + 1 + root.name.length], detail: 'RootNotTemplates' },
    };
  }
  const templates: MailTemplateInfo[] = [];
  for (const template of root.children) {
    // edu-sharing reads /templates/template and skips templates without a name.
    if (template.kind !== 'element' || template.name !== 'template') {
      continue;
    }
    const name = template.attributes.get('name');
    if (!name) {
      continue;
    }
    // An empty context is a context of its own for edu-sharing's TemplateDescription, unlike none at all.
    const context = template.attributes.get('context');
    templates.push({
      element: template,
      id: context ? `${name.value}@${context.value}` : name.value,
      fields: template.children.flatMap((child) =>
        child.kind === 'element' && (MAIL_FIELDS as readonly string[]).includes(child.name)
          ? [fieldInfo(text, child)]
          : [],
      ),
    });
  }
  return { ok: true, root, templates };
}

function fieldInfo(text: string, element: XmlElement): MailFieldInfo {
  const field = element.name as MailField;
  if (element.selfClosing) {
    return { field, element, value: '', valueRange: element.range, mode: 'empty' };
  }
  const { children } = element;
  if (children.some((child) => child.kind !== 'text' && child.kind !== 'cdata')) {
    return { field, element, value: undefined, valueRange: element.content, mode: 'text' };
  }
  const inCData = cdataRun(text, children);
  if (inCData) {
    const [first, last] = inCData;
    const valueRange: TextRange = [withoutLayout(text, first.inner)[0], withoutLayout(text, last.inner)[1]];
    let value = '';
    for (const child of children.slice(children.indexOf(first), children.indexOf(last) + 1)) {
      if (child.kind === 'cdata') {
        const from = Math.max(child.inner[0], valueRange[0]);
        const to = Math.min(child.inner[1], valueRange[1]);
        value += from < to ? lineFeeds(text.slice(from, to)) : '';
      } else if (child.kind === 'text') {
        value += decodeEntities(text.slice(...child.range), child.range[0]);
      }
    }
    return { field, element, value, valueRange, mode: 'cdata' };
  }
  const valueRange = withoutLayout(text, element.content);
  let value = '';
  for (const child of children) {
    const [start, end] = child.kind === 'cdata' ? child.inner : child.range;
    const from = Math.max(start, valueRange[0]);
    const to = Math.min(end, valueRange[1]);
    if (from < to) {
      // Layout is only ever cut off white space at the edges of text, never inside a CDATA section.
      const raw = lineFeeds(text.slice(from, to));
      value += child.kind === 'cdata' ? raw : decodeEntities(raw, from);
    }
  }
  return { field, element, value, valueRange, mode: 'text' };
}

/**
 * The first and the last CDATA section of a text held in CDATA: its sections are separated by nothing or by
 * character references only (as the writer splits a text at `]]>` and, in ISO-8859-1, at characters the file cannot
 * hold), and only blank text stands around them. Undefined for any other content.
 */
function cdataRun(text: string, children: readonly XmlNode[]): [XmlCData, XmlCData] | undefined {
  const sections = children.filter((child): child is XmlCData => child.kind === 'cdata');
  const first = sections[0];
  const last = sections[sections.length - 1];
  if (!first || !last) {
    return undefined;
  }
  const [from, to] = [children.indexOf(first), children.indexOf(last)];
  const fits = children.every((child, index) => {
    if (child.kind === 'cdata') {
      return true;
    }
    const raw = text.slice(...child.range);
    return index > from && index < to
      ? /^(?:&#x[0-9a-fA-F]+;|&#[0-9]+;)+$/.test(raw)
      : /^[ \t\r\n]*$/.test(raw);
  });
  return fits ? [first, last] : undefined;
}

/** XML reads every line break as a line feed, in CDATA sections too. */
function lineFeeds(raw: string): string {
  return raw.replace(/\r\n?/g, '\n');
}

/**
 * The range without its layout: white space at either end that contains a line break, i.e. the indentation of
 * the surrounding lines. White space within one line may be meant and stays.
 */
function withoutLayout(text: string, [start, end]: TextRange): TextRange {
  const blank = (index: number) => ' \t\r\n'.includes(text[index]!);
  // Loops, not a regular expression: `/\s*$/` would take quadratic time on long runs of white space.
  let lead = start;
  while (lead < end && blank(lead)) {
    lead++;
  }
  if (!/[\r\n]/.test(text.slice(start, lead))) {
    lead = start;
  }
  let trail = end;
  while (trail > lead && blank(trail - 1)) {
    trail--;
  }
  if (!/[\r\n]/.test(text.slice(trail, end))) {
    trail = end;
  }
  return [lead, trail];
}

function nameRange(template: MailTemplateInfo): TextRange {
  return template.element.attributes.get('name')!.range;
}
