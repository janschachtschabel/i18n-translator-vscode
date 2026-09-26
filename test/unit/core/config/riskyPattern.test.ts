import { describe, expect, it } from 'vitest';
import { riskyPattern } from '../../../../src/core/config/riskyPattern';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { DEFAULT_VARIANTS } from '../../../../src/core/checks/variants';

// Expressions from the settings run on every index run; one that backtracks exponentially stops the extension
// host (audit S-06).
describe('riskyPattern', () => {
  it('refuses a repeated group that starts with a repeated part', () => {
    const risky = [
      '(a+)+',
      '^(a+)+$',
      '(\\w*)*',
      '(?:\\d+)*x',
      '(.*)+',
      '(\\s*\\w+)*',
      '([a-z]+)*',
      '((a+)b)*',
      '(x|y+)+',
      '(a{2,})+',
      '(a+){2,}',
      '(?<word>a?b)+',
      // Escapes and classes are one atom each, whatever they contain.
      '(\\)+)+',
      '([)]+)+',
      '(\\u{1F600}+)+',
      '(\\p{L}+)*',
    ];
    for (const source of risky) {
      expect(riskyPattern(source), source).toMatch(/repeated/);
    }
  });

  it('accepts the expressions of the presets and defaults, and repetitions that cannot overlap', () => {
    const fine = [
      ANGULAR_PRESET.localePattern,
      '[a-z]{2}(-[a-z0-9]+)*',
      '[a-z]{2}_[A-Z]{2}',
      '[^/]+?',
      '(a+)',
      '(a+)?',
      '(a+){3}',
      '(ab)+',
      'a+b+',
      '\\(a+\\)+',
      '[(]a+[)]+',
      '(\\.\\w+)*',
      ...Object.values(DEFAULT_VARIANTS).flatMap((variant) => [
        variant.requiredWhen,
        variant.forbidden ?? '',
      ]),
    ];
    for (const source of fine) {
      expect(riskyPattern(source), source).toBeUndefined();
    }
  });

  it('refuses very long expressions', () => {
    expect(riskyPattern('a'.repeat(1000))).toBeUndefined();
    expect(riskyPattern('a'.repeat(1001))).toMatch(/1000 characters/);
  });
});
