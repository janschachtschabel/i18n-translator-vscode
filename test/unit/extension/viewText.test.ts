import { describe, expect, it } from 'vitest';
import { badgeText, escapeMarkdown, plainNotice } from '../../../src/extension/views/viewText';

/** How VS Code finds links in notification texts (`parseLinkedText` in the workbench, 1.90 to 1.139). */
const NOTIFICATION_LINK = /\[([^\]]+)\]\(((?:https?:\/\/|command:|file:)[^)\s]+)(?: (["'])(.+?)(\3))?\)/gi;

describe('plainNotice', () => {
  // A folder of the repository can be named like a link; its name then shows in messages (audit S-01).
  it('keeps names from the workspace from turning into links that run commands', () => {
    const name =
      '[Add reference file](command:workbench.action.terminal.sendSequence?%7B%22text%22%3A%22id%22%7D)';
    const notice = plainNotice(`${name} has no file in the reference language de.`);
    expect(notice.match(NOTIFICATION_LINK)).toBeNull();
    expect(notice.replaceAll('\u200b', '')).toBe(`${name} has no file in the reference language de.`);
  });

  it('breaks every link of a message, also web and file links', () => {
    const notice = plainNotice('[a](https://example.org) and [b](file:///etc/passwd "t") and [c](command:x)');
    expect(notice.match(NOTIFICATION_LINK)).toBeNull();
  });

  it('leaves a message without links as it is', () => {
    expect(plainNotice('Undone: common/fr.json (a [draft]).')).toBe('Undone: common/fr.json (a [draft]).');
  });
});

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
