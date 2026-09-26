import { describe, expect, it } from 'vitest';
import { compileVariants, DEFAULT_VARIANTS } from '../../../../src/core/checks/variants';

describe('compileVariants', () => {
  const { variants, errors } = compileVariants(DEFAULT_VARIANTS);

  it('compiles the edu-sharing defaults', () => {
    expect(errors).toEqual([]);
    expect([...variants.keys()]).toEqual(['de-informal', 'de-no-binnen-i']);
    expect(variants.get('de-informal')?.base).toBe('de');
  });

  it('detects the formal address for de-informal', () => {
    const informal = variants.get('de-informal')!;
    expect(informal.required?.exec('Möchten Sie fortfahren?')?.[0]).toBe('Sie');
    expect(informal.required?.test('Möchtest Du fortfahren?')).toBe(false);
    expect(informal.forbidden?.exec('Erstelle eine Sammlung für Ihr Medienzentrum')?.[0]).toBe('Ihr');
  });

  it('detects gender markers for de-no-binnen-i', () => {
    const neutral = variants.get('de-no-binnen-i')!;
    expect(neutral.required?.exec('Autor{{GENDER_SEPARATOR}}in')?.[0]).toBe('{{GENDER_SEPARATOR}}');
    expect(neutral.required?.exec('alle Lehrer*innen')?.[0]).toBe('*innen');
    expect(neutral.required?.exec('alle LehrerInnen')?.[0]).toBe('rInnen');
    expect(neutral.required?.test('alle Lehrerinnen und Lehrer')).toBe(false);
    expect(neutral.forbidden?.test('Autor{{ GENDER_SEPARATOR }}in')).toBe(false);
  });

  it('reports invalid expressions instead of throwing', () => {
    const result = compileVariants({ 'de-x': { base: 'de', requiredWhen: '(', forbidden: '[' } });
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/de-x/);
  });

  it('refuses expressions that could take exponential time, like invalid ones (audit S-06)', () => {
    const result = compileVariants({ 'de-x': { base: 'de', requiredWhen: '(\\w+)*$', forbidden: 'Sie' } });
    expect(result.errors).toEqual([expect.stringMatching(/^Variant de-x: .*repeated/)]);
    expect(result.variants.get('de-x')?.required).toBeUndefined();
  });

  it('keeps a variant with an invalid expression, so it still counts as sparse', () => {
    const variant = compileVariants({
      'de-x': { base: 'de', requiredWhen: '(', forbidden: 'Sie' },
    }).variants.get('de-x');
    expect(variant?.base).toBe('de');
    expect(variant?.required).toBeUndefined();
    expect(variant?.forbidden?.source).toBe('Sie');
  });
});
