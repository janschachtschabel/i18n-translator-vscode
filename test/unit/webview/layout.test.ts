import { describe, expect, it } from 'vitest';
import { compactLocales, layoutFor } from '../../../src/webview/state/layout';
import { locale } from '../support/viewModels';

describe('layoutFor', () => {
  it('chooses by width: a table from 900 px, a list below, the compact list up to 480 px', () => {
    expect(layoutFor('auto', 1400)).toBe('table');
    expect(layoutFor('auto', 900)).toBe('table');
    expect(layoutFor('auto', 899)).toBe('list');
    expect(layoutFor('auto', 481)).toBe('list');
    expect(layoutFor('auto', 480)).toBe('compact');
    expect(layoutFor('auto', 320)).toBe('compact');
  });

  it('keeps the layout the user chose, whatever the width', () => {
    expect(layoutFor('table', 320)).toBe('table');
    expect(layoutFor('list', 1400)).toBe('list');
    expect(layoutFor('list', 320)).toBe('list');
  });
});

describe('compactLocales', () => {
  const locales = [
    locale('de', { reference: true }),
    locale('de-informal', { variant: true }),
    locale('fr'),
    locale('it'),
  ];
  const codes = (hidden: string[], chosen: string | null, of = locales) =>
    compactLocales(of, hidden, chosen).map((shown) => shown.code);

  it('shows the reference and the chosen language, else the first visible full language', () => {
    expect(codes([], null)).toEqual(['de', 'fr']);
    expect(codes([], 'it')).toEqual(['de', 'it']);
    expect(codes(['fr'], null)).toEqual(['de', 'it']);
  });

  // Hiding a language is the user's latest word on it (audit F-02).
  it('leaves out a chosen language that is hidden, and shows only the reference when all others are', () => {
    expect(codes(['it'], 'it')).toEqual(['de', 'fr']);
    expect(codes(['de-informal', 'fr', 'it'], 'it')).toEqual(['de']);
  });

  it('shows the chosen language alone without a reference', () => {
    const unreferenced = locales.map((shown) => ({ ...shown, reference: false }));
    expect(codes([], null, unreferenced)).toEqual(['de']);
    expect(codes([], 'it', unreferenced)).toEqual(['it']);
  });
});
