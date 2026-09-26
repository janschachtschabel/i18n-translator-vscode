/** How a file is laid out, so that written lines look like the ones around them. */
export interface TextStyle {
  /** `\r` alone: files of classic Mac OS, which Java, JSON and XML all read. */
  eol: '\n' | '\r\n' | '\r';
  /** One level of indentation, e.g. two spaces or a tab. */
  indent: string;
  finalNewline: boolean;
}

/** The layout of edu-sharing's translation files. */
export const DEFAULT_STYLE: TextStyle = { eol: '\n', indent: '  ', finalNewline: true };

/**
 * Line ending of the first line break, indentation of the first indented line (one level in nested
 * formats) and whether the text ends with a line break. What the text does not show comes from
 * {@link DEFAULT_STYLE}.
 */
export function detectStyle(text: string): TextStyle {
  const firstBreak = /\r\n|\r|\n/.exec(text)?.[0] as TextStyle['eol'] | undefined;
  const indent = /^([ \t]+)\S/m.exec(text)?.[1];
  return {
    eol: firstBreak ?? DEFAULT_STYLE.eol,
    indent: indent ?? DEFAULT_STYLE.indent,
    finalNewline: text === '' ? DEFAULT_STYLE.finalNewline : /[\r\n]$/.test(text),
  };
}
