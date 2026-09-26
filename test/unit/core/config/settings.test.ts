import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { DEFAULT_VARIANTS } from '../../../../src/core/checks/variants';
import {
  DEFAULT_BACKUP_SETTINGS,
  DEFAULT_SETTINGS,
  parseBackupSettings,
  parseSettings,
} from '../../../../src/core/config/settings';

describe('parseSettings', () => {
  it('uses the defaults when nothing is configured', () => {
    expect(parseSettings({})).toEqual({ settings: DEFAULT_SETTINGS, errors: [] });
    expect(DEFAULT_SETTINGS.areas).toEqual([ANGULAR_PRESET]);
    expect(DEFAULT_SETTINGS.variants).toEqual(DEFAULT_VARIANTS);
  });

  it('adds custom areas and lets them replace a preset with the same id', () => {
    const custom = {
      id: 'kunde',
      format: 'json-nested',
      roots: ['customer/i18n'],
      files: '{bundle}/{locale}.json',
      localePattern: '[a-z]{2}',
    };
    const override = { ...custom, id: 'edu-sharing.angular', roots: ['web/i18n'] };
    const { settings, errors } = parseSettings({ areas: [custom, override] });
    expect(errors).toEqual([]);
    expect(settings.areas.map((area) => [area.id, area.roots])).toEqual([
      ['edu-sharing.angular', ['web/i18n']],
      ['kunde', ['customer/i18n']],
    ]);
  });

  it('skips invalid areas and reports them with their position', () => {
    const { settings, errors } = parseSettings({ areas: [{ id: 'x' }] });
    expect(settings.areas).toEqual([ANGULAR_PRESET]);
    expect(errors[0]).toMatch(/^eduI18n\.areas\[0\]: /);
  });

  it('validates severity overrides against the rule catalog', () => {
    const { settings, errors } = parseSettings({
      'checks.severity': {
        'missing-key': 'error',
        'same-as-reference': 'off',
        'no-such-rule': 'error',
        'empty-value': 'loud',
      },
    });
    expect(settings.severityOverrides).toEqual({ 'missing-key': 'error', 'same-as-reference': 'off' });
    expect(errors).toHaveLength(2);
  });

  it('validates the shape of variant definitions', () => {
    const { settings, errors } = parseSettings({
      variants: { 'de-informal': DEFAULT_VARIANTS['de-informal'], 'de-x': { base: 'de' } },
    });
    expect(Object.keys(settings.variants)).toEqual(['de-informal']);
    expect(errors[0]).toMatch(/de-x/);
  });

  it('falls back to the default for values of the wrong type', () => {
    const { settings, errors } = parseSettings({ referenceLanguage: 42, exclude: 'node_modules', roots: [] });
    expect(settings.referenceLanguage).toBe('de');
    expect(settings.exclude).toEqual(DEFAULT_SETTINGS.exclude);
    expect(settings.roots).toEqual({});
    expect(errors).toHaveLength(3);
  });

  it('normalizes configured roots and drops roots outside the workspace', () => {
    const { settings, errors } = parseSettings({ roots: { a: ['./x/', '../y'], b: ['/etc'] } });
    expect(settings.roots).toEqual({ a: ['x'], b: [] });
    expect(errors).toHaveLength(2);
  });

  it('accepts roots per area', () => {
    expect(
      parseSettings({ roots: { 'edu-sharing.angular': ['Frontend/src/assets/i18n'] } }).settings.roots,
    ).toEqual({
      'edu-sharing.angular': ['Frontend/src/assets/i18n'],
    });
  });
});

describe('parseBackupSettings', () => {
  it('uses the defaults when nothing is configured', () => {
    expect(parseBackupSettings({})).toEqual({ settings: DEFAULT_BACKUP_SETTINGS, errors: [] });
    expect(DEFAULT_BACKUP_SETTINGS).toEqual({ intervalMinutes: 10, keep: 10 });
  });

  it('reads the interval and how many backups to keep', () => {
    expect(parseBackupSettings({ 'backup.intervalMinutes': 0, 'backup.keep': 100 })).toEqual({
      settings: { intervalMinutes: 0, keep: 100 },
      errors: [],
    });
  });

  it('falls back to the defaults for values out of range or of the wrong type', () => {
    for (const [intervalMinutes, keep] of [
      [-1, 0],
      ['10', 101],
      [Number.NaN, 0.5],
    ] as const) {
      const result = parseBackupSettings({ 'backup.intervalMinutes': intervalMinutes, 'backup.keep': keep });
      expect(result.settings).toEqual(DEFAULT_BACKUP_SETTINGS);
      expect(result.errors).toHaveLength(2);
    }
  });
});
