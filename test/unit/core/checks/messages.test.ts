import { describe, expect, it } from 'vitest';
import { formatMessage, ISSUE_MESSAGES } from '../../../../src/core/checks/messages';

describe('formatMessage', () => {
  it('fills named arguments', () => {
    expect(formatMessage('{key} is missing in {locale}.', { key: 'SAVE', locale: 'fr' })).toBe(
      'SAVE is missing in fr.',
    );
  });

  it('joins lists and marks empty lists', () => {
    expect(formatMessage('missing {missing}, extra {extra}', { missing: ['date', 'time'], extra: [] })).toBe(
      'missing date, time, extra –',
    );
  });

  it('keeps unknown placeholders visible', () => {
    expect(formatMessage('{known} {unknown}', { known: 1 })).toBe('1 {unknown}');
  });
});

describe('ISSUE_MESSAGES', () => {
  it('uses only arguments in braces that formatMessage can fill', () => {
    for (const template of Object.values(ISSUE_MESSAGES)) {
      expect(template).not.toMatch(/\{(?!\w+\})/);
    }
  });
});
