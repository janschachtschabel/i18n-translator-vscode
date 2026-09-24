import { describe, expect, it } from 'vitest';
import { badgeText, escapeMarkdown } from '../../../src/extension/views/viewText';

describe('escapeMarkdown', () => {
  it('keeps names from the workspace from turning into links or tables', () => {
    expect(escapeMarkdown('a](command:x)')).toBe('a\\]\\(command:x\\)');
    expect(escapeMarkdown('a|b')).toBe('a\\|b');
    expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
  });

  it('shows HTML and entities as text', () => {
    expect(escapeMarkdown('<b>')).toBe('\\<b\\>');
    expect(escapeMarkdown('&lt;b&gt;')).toBe('\\&lt;b\\&gt;');
  });

  it('leaves letters, digits and spaces alone', () => {
    expect(escapeMarkdown('common 2')).toBe('common 2');
  });
});

describe('badgeText', () => {
  it('shows counts up to 9 and "9+" above, as decoration badges hold two characters', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(9)).toBe('9');
    expect(badgeText(10)).toBe('9+');
    expect(badgeText(1189)).toBe('9+');
  });
});
