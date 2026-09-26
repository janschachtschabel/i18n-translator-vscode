import { beforeEach, describe, expect, it } from 'vitest';
import { htmlMismatchRule } from '../../../src/core/checks/rules/htmlMismatch';
import { placeholderMismatchRule } from '../../../src/core/checks/rules/placeholderMismatch';
import { inlineCheck } from '../../../src/webview/components/inlineCheck';
import { setTranslations } from '../../../src/webview/l10n';
import german from '../../../l10n/bundle.l10n.de.json';

beforeEach(() => setTranslations(german));

describe('inlineCheck', () => {
  it('names the placeholders and tags the text lacks or has beyond the reference', () => {
    expect(inlineCheck('Fehler am {{date}}: <b>{{name}}</b>', 'Erreur le {{data}} : {{name}}')).toEqual([
      { severity: 'error', text: 'Fehlende Platzhalter: {{date}}' },
      { severity: 'error', text: 'Platzhalter, die die Referenz nicht hat: {{data}}' },
      { severity: 'warning', text: 'Fehlende HTML-Tags: </b>, <b>' },
    ]);
    expect(inlineCheck('Text', 'Texte <i>')).toEqual([
      { severity: 'warning', text: 'HTML-Tags, die die Referenz nicht hat: <i>' },
    ]);
  });

  it('says when they match, once the reference has any', () => {
    expect(inlineCheck('Am {{date}}', 'Le {{date}}')).toEqual([
      { severity: 'ok', text: 'Platzhalter und HTML-Tags wie in der Referenz.' },
    ]);
    expect(inlineCheck('Speichern', 'Enregistrer')).toEqual([]);
  });

  it('checks nothing without a reference text, or when the text is cleared', () => {
    expect(inlineCheck(undefined, 'Le {{date}}')).toEqual([]);
    expect(inlineCheck('', 'Le {{date}}')).toEqual([]);
    expect(inlineCheck('Am {{date}}', '')).toEqual([]);
    // Texts of only white space count as none, as in the checks and when saving.
    expect(inlineCheck(' ', 'Le {{date}}')).toEqual([]);
    expect(inlineCheck('Am {{date}}', '  ')).toEqual([]);
  });

  it('weighs a difference as the checks do by default', () => {
    expect(placeholderMismatchRule.defaultSeverity).toBe('error');
    expect(htmlMismatchRule.defaultSeverity).toBe('warning');
  });
});
