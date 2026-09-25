import { afterEach, describe, expect, it } from 'vitest';
import { RULE_IDS } from '../../../src/core/checks/types';
import { statusWord } from '../../../src/webview/components/cellStatus';
import { setTranslations } from '../../../src/webview/l10n';
import { GERMAN } from './support';

afterEach(() => setTranslations({}));

describe('statusWord', () => {
  it('has a word for every finding about a single text', () => {
    setTranslations(GERMAN);
    // These are about a whole file; the editor shows them at the language, not in a cell.
    const fileWide = ['parse-error', 'not-utf8', 'missing-file'];
    expect(RULE_IDS.filter((rule) => !fileWide.includes(rule) && statusWord(rule) === 'Befund')).toEqual([]);
    expect(statusWord('missing-key')).toBe('fehlt');
    expect(statusWord('placeholder-malformed')).toBe('Platzhalter');
    expect(statusWord('parse-error')).toBe('Befund');
  });
});
