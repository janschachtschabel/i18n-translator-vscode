import type { TextRange } from '../adapter';

/** An element with the positions a surgical edit needs. */
export interface XmlElement {
  kind: 'element';
  name: string;
  /** From `<` of the start tag to after `>` of the end tag or of the self-closing tag. */
  range: TextRange;
  /** Between start and end tag; for a self-closing tag empty, at its end. */
  content: TextRange;
  selfClosing: boolean;
  attributes: ReadonlyMap<string, XmlAttribute>;
  children: XmlNode[];
}

export interface XmlAttribute {
  /** With entities resolved. */
  value: string;
  /** Of the value, without the quotes. */
  range: TextRange;
}

export interface XmlText {
  kind: 'text';
  range: TextRange;
  /** With entities resolved. */
  value: string;
}

export interface XmlCData {
  kind: 'cdata';
  range: TextRange;
  /** Between `<![CDATA[` and `]]>`, which is the value as it is. */
  inner: TextRange;
}

export interface XmlOther {
  kind: 'comment' | 'instruction';
  range: TextRange;
}

export type XmlNode = XmlElement | XmlText | XmlCData | XmlOther;

export type XmlResult = { ok: true; root: XmlElement } | { ok: false; range: TextRange; detail: string };

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

class XmlSyntaxError extends Error {
  constructor(
    readonly range: TextRange,
    readonly detail: string,
  ) {
    super(detail);
  }
}

/**
 * Reads a well-formed XML document with positions. A DOCTYPE is refused: it could define entities, which the
 * editor would have to expand to show the text as the runtime reads it.
 */
export function parseXml(text: string): XmlResult {
  try {
    return { ok: true, root: new Parser(text).document() };
  } catch (error) {
    if (error instanceof XmlSyntaxError) {
      return { ok: false, range: error.range, detail: error.detail };
    }
    if (error instanceof RangeError) {
      // The call stack overflowed on nesting far deeper than any template: report, don't crash.
      return { ok: false, range: [0, 0], detail: 'TooDeep' };
    }
    throw error;
  }
}

/** Resolves the five predefined entities and character references; anything else is a syntax error. */
export function decodeEntities(raw: string, offset: number): string {
  return raw.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*)?(;)?/g,
    (match, name: string, semicolon, at) => {
      const range: TextRange = [offset + at, offset + at + match.length];
      if (name === undefined || semicolon === undefined) {
        throw new XmlSyntaxError(range, 'InvalidEntity');
      }
      if (!name.startsWith('#')) {
        const entity = ENTITIES[name];
        if (entity === undefined) {
          throw new XmlSyntaxError(range, 'UnknownEntity');
        }
        return entity;
      }
      const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (!(code >= 0x9 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) {
        throw new XmlSyntaxError(range, 'InvalidCharacterReference');
      }
      return String.fromCodePoint(code);
    },
  );
}

class Parser {
  private position = 0;

  constructor(private readonly text: string) {}

  document(): XmlElement {
    this.misc();
    if (this.text.startsWith('<!DOCTYPE', this.position)) {
      this.fail('DoctypeNotSupported', 9);
    }
    if (this.text[this.position] !== '<') {
      this.fail('RootExpected');
    }
    const root = this.element();
    this.misc();
    if (this.position < this.text.length) {
      this.fail('ContentAfterRoot');
    }
    return root;
  }

  /** White space, comments and processing instructions (the XML declaration among them) around the root. */
  private misc(): void {
    for (;;) {
      this.skipSpace();
      if (this.text.startsWith('<?', this.position)) {
        this.instruction();
      } else if (this.text.startsWith('<!--', this.position)) {
        this.comment();
      } else {
        return;
      }
    }
  }

  private element(): XmlElement {
    const start = this.position;
    this.position++;
    const name = this.name();
    const attributes = new Map<string, XmlAttribute>();
    for (;;) {
      const spaced = this.skipSpace();
      if (this.text.startsWith('/>', this.position)) {
        this.position += 2;
        const end = this.position;
        return {
          kind: 'element',
          name,
          range: [start, end],
          content: [end, end],
          selfClosing: true,
          attributes,
          children: [],
        };
      }
      if (this.text[this.position] === '>') {
        this.position++;
        break;
      }
      if (this.position >= this.text.length) {
        this.fail('UnclosedTag', 0, start);
      }
      if (!spaced) {
        this.fail('SpaceExpected');
      }
      this.attribute(attributes);
    }
    const contentStart = this.position;
    const children: XmlNode[] = [];
    for (;;) {
      if (this.position >= this.text.length) {
        this.fail('UnclosedElement', 1 + name.length, start);
      }
      if (this.text.startsWith('</', this.position)) {
        const contentEnd = this.position;
        this.position += 2;
        if (this.name() !== name) {
          throw new XmlSyntaxError([contentEnd, this.position], 'MismatchedEndTag');
        }
        this.skipSpace();
        this.expect('>');
        return {
          kind: 'element',
          name,
          range: [start, this.position],
          content: [contentStart, contentEnd],
          selfClosing: false,
          attributes,
          children,
        };
      }
      children.push(this.node());
    }
  }

  private node(): XmlNode {
    if (this.text.startsWith('<![CDATA[', this.position)) {
      const start = this.position;
      const end = this.text.indexOf(']]>', start + 9);
      if (end === -1) {
        this.fail('UnclosedCData', 9);
      }
      this.position = end + 3;
      return { kind: 'cdata', range: [start, this.position], inner: [start + 9, end] };
    }
    if (this.text.startsWith('<!--', this.position)) {
      return this.comment();
    }
    if (this.text.startsWith('<?', this.position)) {
      return this.instruction();
    }
    if (this.text[this.position] === '<') {
      return this.element();
    }
    const start = this.position;
    const end = this.text.indexOf('<', start);
    this.position = end === -1 ? this.text.length : end;
    const raw = this.text.slice(start, this.position);
    const misplaced = raw.indexOf(']]>');
    if (misplaced !== -1) {
      throw new XmlSyntaxError([start + misplaced, start + misplaced + 3], 'CDataEndInText');
    }
    return { kind: 'text', range: [start, this.position], value: decodeEntities(raw, start) };
  }

  private attribute(attributes: Map<string, XmlAttribute>): void {
    const start = this.position;
    const name = this.name();
    this.skipSpace();
    this.expect('=');
    this.skipSpace();
    const quote = this.text[this.position];
    if (quote !== '"' && quote !== "'") {
      this.fail('QuoteExpected');
    }
    const valueStart = this.position + 1;
    const valueEnd = this.text.indexOf(quote, valueStart);
    if (valueEnd === -1) {
      this.fail('UnclosedAttribute', 1);
    }
    const raw = this.text.slice(valueStart, valueEnd);
    if (raw.includes('<')) {
      this.fail('LessThanInAttribute', 1);
    }
    if (attributes.has(name)) {
      throw new XmlSyntaxError([start, start + name.length], 'DuplicateAttribute');
    }
    attributes.set(name, { value: decodeEntities(raw, valueStart), range: [valueStart, valueEnd] });
    this.position = valueEnd + 1;
  }

  private comment(): XmlOther {
    const start = this.position;
    const end = this.text.indexOf('-->', start + 4);
    if (end === -1) {
      this.fail('UnclosedComment', 4);
    }
    this.position = end + 3;
    return { kind: 'comment', range: [start, this.position] };
  }

  private instruction(): XmlOther {
    const start = this.position;
    const end = this.text.indexOf('?>', start + 2);
    if (end === -1) {
      this.fail('UnclosedInstruction', 2);
    }
    this.position = end + 2;
    return { kind: 'instruction', range: [start, this.position] };
  }

  private name(): string {
    NAME.lastIndex = this.position;
    const match = NAME.exec(this.text);
    if (!match) {
      this.fail('NameExpected');
    }
    this.position += match[0].length;
    return match[0];
  }

  /** XML white space; whether there was any. */
  private skipSpace(): boolean {
    const start = this.position;
    while (' \t\r\n'.includes(this.text[this.position] ?? 'x')) {
      this.position++;
    }
    return this.position > start;
  }

  private expect(char: string): void {
    if (this.text[this.position] !== char) {
      this.fail('UnexpectedCharacter');
    }
    this.position++;
  }

  private fail(detail: string, length = 1, at = this.position): never {
    throw new XmlSyntaxError([at, Math.min(at + length, this.text.length)], detail);
  }
}
