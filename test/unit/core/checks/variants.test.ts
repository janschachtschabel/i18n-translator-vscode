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
    expect(informal.required.exec('Möchten Sie fortfahren?')?.[0]).toBe('Sie');
    expect(informal.required.test('Möchtest Du fortfahren?')).toBe(false);
    expect(informal.forbidden?.exec('Erstelle eine Sammlung für Ihr Medienzentrum')?.[0]).toBe('Ihr');
  });

  it('detects gender markers for de-no-binnen-i', () => {
    const neutral = variants.get('de-no-binnen-i')!;
    expect(neutral.required.exec('Autor{{GENDER_SEPARATOR}}in')?.[0]).toBe('{{GENDER_SEPARATOR}}');
    expect(neutral.required.exec('alle Lehrer*innen')?.[0]).toBe('*innen');
    expect(neutral.required.exec('alle LehrerInnen')?.[0]).toBe('rInnen');
    expect(neutral.required.test('alle Lehrerinnen und Lehrer')).toBe(false);
  });

  it('reports invalid expressions instead of throwing', () => {
    const result = compileVariants({ 'de-x': { base: 'de', requiredWhen: '(' } });
    expect(result.variants.size).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/de-x/);
  });
});
