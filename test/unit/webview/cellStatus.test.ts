import { afterEach, describe, expect, it } from 'vitest';
import { RULE_IDS } from '../../../src/core/checks/types';
import { cellMark, statusWord } from '../../../src/webview/components/cellStatus';
import { setTranslations } from '../../../src/webview/l10n';
import { text } from '../support/viewModels';
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

describe('cellMark', () => {
  it('is the most severe finding of a text, "not saved" counting as an error; hints mark nothing', () => {
    expect(cellMark(text('Speichern'))).toBeUndefined();
    expect(cellMark(text('Minute', { rule: 'same-as-reference', severity: 'info' }))).toBeUndefined();
    expect(cellMark(text(undefined, 'missing-key'))).toBe('warning');
    expect(cellMark(text('', 'empty-value', { rule: 'same-as-reference', severity: 'info' }))).toBe(
      'warning',
    );
    expect(
      cellMark(text('Erreur', 'html-mismatch', { rule: 'placeholder-mismatch', severity: 'error' })),
    ).toBe('error');
    expect(cellMark({ ...text('Enregistrer'), notSaved: 'Die Datei hat sich geändert.' })).toBe('error');
  });
});
