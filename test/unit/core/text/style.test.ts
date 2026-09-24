import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, detectStyle } from '../../../../src/core/text/style';

describe('detectStyle', () => {
  it('detects the style of an edu-sharing translation file', () => {
    expect(detectStyle('{\n  "A": {\n    "B": "x"\n  }\n}\n')).toEqual({
      eol: '\n',
      indent: '  ',
      finalNewline: true,
    });
  });

  it('detects CRLF line endings', () => {
    expect(detectStyle('{\r\n  "A": "x"\r\n}\r\n').eol).toBe('\r\n');
  });

  it('takes the indentation of the first indented line', () => {
    expect(detectStyle('{\n\t"A": "x"\n}\n').indent).toBe('\t');
    expect(detectStyle('{\n    "A": {\n        "B": "x"\n    }\n}\n').indent).toBe('    ');
  });

  it('notices a missing newline at the end', () => {
    expect(detectStyle('{\n  "A": "x"\n}').finalNewline).toBe(false);
  });

  it('falls back to the defaults where the text shows nothing', () => {
    expect(detectStyle('')).toEqual(DEFAULT_STYLE);
    expect(detectStyle('{}')).toEqual({ ...DEFAULT_STYLE, finalNewline: false });
    expect(DEFAULT_STYLE).toEqual({ eol: '\n', indent: '  ', finalNewline: true });
  });
});
