import { beforeEach, describe, expect, it } from 'vitest';
import { htmlMismatchRule } from '../../../src/core/checks/rules/htmlMismatch';
import { placeholderMismatchRule } from '../../../src/core/checks/rules/placeholderMismatch';
import { inlineCheck } from '../../../src/webview/inlineCheck';
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

  it('checks the placeholders in the syntax of the area', () => {
    expect(inlineCheck('{user} lädt ein', '{usr} invite', 'single-brace')).toEqual([
      { severity: 'error', text: 'Fehlende Platzhalter: {user}' },
      { severity: 'error', text: 'Platzhalter, die die Referenz nicht hat: {usr}' },
    ]);
  });

  // edu-sharing replaces exactly "{{link}}" in a mail; "{{ link }}" stays in it (audit L-31).
  it('compares the placeholders of mail texts as written, and still their conditions', () => {
    expect(inlineCheck('{{if link}}{{link}}{{endif}}', '{{ link }}', 'double-brace-exact')).toEqual([
      { severity: 'error', text: 'Fehlende Platzhalter: {{link}}' },
      { severity: 'error', text: 'Platzhalter, die die Referenz nicht hat: {{ link }}' },
      { severity: 'error', text: 'Fehlende Bedingungen: {{if link}}' },
    ]);
    expect(
      inlineCheck('{{if a}}{{link}}{{endif}}', '{{if a}}{{link}}{{endif}}', 'double-brace-exact'),
    ).toEqual([{ severity: 'ok', text: 'Platzhalter und HTML-Tags wie in der Referenz.' }]);
  });

  it('names the conditions of mail texts that differ from the reference or lack their pair', () => {
    expect(inlineCheck('{{if a}}A{{endif}}{{if b}}B{{endif}}', '{{if a}}A{{if c}}C{{endif}}')).toEqual([
      { severity: 'error', text: 'Fehlende Bedingungen: {{if b}}' },
      { severity: 'error', text: 'Bedingungen, die die Referenz nicht hat: {{if c}}' },
      { severity: 'error', text: 'Bedingungen ohne ihr Gegenstück: {{if a}}' },
    ]);
    expect(inlineCheck('{{if a}}A{{endif}}', '{{if a}}A{{endif}}')).toEqual([
      { severity: 'ok', text: 'Platzhalter und HTML-Tags wie in der Referenz.' },
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
