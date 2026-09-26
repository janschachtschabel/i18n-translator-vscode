import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMAT_IDS, MERGE_SEMANTICS, PLACEHOLDER_SYNTAXES } from '../../src/core/area/areaDefinition';
import { PRESETS } from '../../src/core/area/presets';
import { RULE_IDS } from '../../src/core/checks/types';
import {
  AI_LIMITS,
  AI_PROVIDERS,
  AI_SETTING_KEYS,
  DEFAULT_AI_SETTINGS,
  REASONING_EFFORTS,
} from '../../src/core/config/aiSettings';
import {
  BACKUP_KEEP_LIMITS,
  BACKUP_SETTING_KEYS,
  DEFAULT_BACKUP_SETTINGS,
  DEFAULT_SETTINGS,
  SETTING_KEYS,
} from '../../src/core/config/settings';

interface SettingSchema {
  type?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, SettingSchema>;
  items?: SettingSchema;
  scope?: string;
  minimum?: number;
  maximum?: number;
}

const read = (file: string) => readFileSync(join(__dirname, '..', '..', file), 'utf8');
const manifest = JSON.parse(read('package.json')) as {
  files: string[];
  activationEvents: string[];
  keywords: string[];
  contributes: {
    configuration: { title: string; properties: Record<string, SettingSchema> }[];
    viewsWelcome: { view: string; contents: string; when: string }[];
  };
};
// Settings in categories of their own, each a section of the Settings editor.
const categories = manifest.contributes.configuration;
const properties: Record<string, SettingSchema> = Object.assign(
  {},
  ...categories.map((category) => category.properties),
);
const setting = (key: string): SettingSchema => properties[`eduI18n.${key}`]!;

describe('package.json configuration', () => {
  it('declares exactly the settings the extension reads', () => {
    expect(Object.keys(properties).sort()).toEqual(
      [...SETTING_KEYS, ...BACKUP_SETTING_KEYS, ...AI_SETTING_KEYS].map((key) => `eduI18n.${key}`).sort(),
    );
  });

  it('puts the AI settings in a category of their own', () => {
    const ai = categories.find((category) => category.title === '%config.ai.title%');
    expect(Object.keys(ai?.properties ?? {}).sort()).toEqual(
      AI_SETTING_KEYS.map((key) => `eduI18n.${key}`).sort(),
    );
  });

  it('lets only user settings choose where the AI requests go, with the key', () => {
    // A workspace setting could send the key to another host (a cloned repository's .vscode/settings.json).
    expect(setting('ai.baseUrl').scope).toBe('machine');
    expect(
      AI_SETTING_KEYS.filter((key) => key !== 'ai.baseUrl' && (setting(key).scope ?? 'window') !== 'window'),
    ).toEqual([]);
  });

  it('offers and limits the AI settings as the code does', () => {
    expect(setting('ai.provider').enum).toEqual([...AI_PROVIDERS]);
    expect(setting('ai.reasoningEffort').enum).toEqual([...REASONING_EFFORTS]);
    expect(setting('ai.reviewReasoningEffort').enum).toEqual([...REASONING_EFFORTS]);
    for (const [key, limits] of Object.entries(AI_LIMITS)) {
      expect(setting(`ai.${key}`), key).toMatchObject(limits);
    }
  });

  it('gives folder settings the resource scope and backup settings the window scope', () => {
    // VS Code logs a warning for every read with the wrong scope: folder settings are read per folder,
    // backup settings without one.
    expect(SETTING_KEYS.filter((key) => setting(key).scope !== 'resource')).toEqual([]);
    expect(BACKUP_SETTING_KEYS.filter((key) => (setting(key).scope ?? 'window') !== 'window')).toEqual([]);
  });

  it('limits the backup settings as the code does', () => {
    expect(setting('backup.intervalMinutes').minimum).toBe(0);
    expect(setting('backup.keep')).toMatchObject(BACKUP_KEEP_LIMITS);
  });

  it('uses the same defaults as the code', () => {
    expect(setting('referenceLanguage').default).toBe(DEFAULT_SETTINGS.referenceLanguage);
    expect(setting('baseFileLanguage').default).toBe(DEFAULT_SETTINGS.baseFileLanguage);
    expect(setting('areas').default).toEqual([]);
    expect(setting('roots').default).toEqual(DEFAULT_SETTINGS.roots);
    expect(setting('exclude').default).toEqual(DEFAULT_SETTINGS.exclude);
    expect(setting('variants').default).toEqual(DEFAULT_SETTINGS.variants);
    expect(setting('checks.severity').default).toEqual({});
    expect(setting('checks.ignoreSameAsReference').default).toEqual(DEFAULT_SETTINGS.ignoreSameAsReference);
    expect(setting('diagnostics.missing').default).toBe(DEFAULT_SETTINGS.missingDiagnostics);
    expect(setting('backup.intervalMinutes').default).toBe(DEFAULT_BACKUP_SETTINGS.intervalMinutes);
    expect(setting('backup.keep').default).toBe(DEFAULT_BACKUP_SETTINGS.keep);
    const { enabled, baseUrl, provider, model, reasoningEffort, reviewReasoningEffort } = DEFAULT_AI_SETTINGS;
    expect(setting('ai.enabled').default).toBe(enabled);
    expect(setting('ai.baseUrl').default).toBe(baseUrl);
    expect(setting('ai.provider').default).toBe(provider);
    expect(setting('ai.model').default).toBe(model);
    expect(setting('ai.reasoningEffort').default).toBe(reasoningEffort);
    expect(setting('ai.reviewReasoningEffort').default).toBe(reviewReasoningEffort);
    expect(setting('ai.batchSize').default).toBe(DEFAULT_AI_SETTINGS.batchSize);
    expect(setting('ai.maxConcurrency').default).toBe(DEFAULT_AI_SETTINGS.maxConcurrency);
    expect(setting('ai.timeoutSeconds').default).toBe(DEFAULT_AI_SETTINGS.timeoutSeconds);
    expect(setting('ai.languageDescriptions').default).toEqual(DEFAULT_AI_SETTINGS.languageDescriptions);
  });

  it('offers every rule id for severity overrides', () => {
    expect(Object.keys(setting('checks.severity').properties ?? {}).sort()).toEqual([...RULE_IDS].sort());
  });

  it('offers the supported formats, merge semantics and placeholder syntaxes for custom areas', () => {
    const area = setting('areas').items?.properties ?? {};
    expect(area['format']?.enum).toEqual([...FORMAT_IDS]);
    expect(area['mergeSemantics']?.enum).toEqual([...MERGE_SEMANTICS]);
    expect(area['placeholderSyntax']?.enum).toEqual([...PLACEHOLDER_SYNTAXES]);
    expect(area['overrideBundlePattern']?.type).toBe('string');
  });
});

// A window without a folder said that its workspace held no translations, and its button did nothing there.
describe('package.json welcome views', () => {
  const welcome = manifest.contributes.viewsWelcome.filter((entry) => entry.view === 'eduI18n.areas');
  const empty = 'workbenchState == empty';

  it('asks a window without a folder to open one, with a link to the folder dialog', () => {
    expect(welcome.filter((entry) => entry.when === empty).map((entry) => entry.contents)).toEqual([
      '%view.areas.noFolder%',
    ]);
    for (const file of ['package.nls.json', 'package.nls.de.json']) {
      const texts = JSON.parse(read(file)) as Record<string, string>;
      expect(texts['view.areas.noFolder'], file).toMatch(/\]\(command:vscode\.openFolder\)$/);
    }
  });

  it('speaks of the translations only in a window with a folder', () => {
    const others = welcome.filter((entry) => entry.when !== empty);
    expect(others.length).toBeGreaterThan(0);
    expect(others.filter((entry) => !entry.when.includes('workbenchState != empty'))).toEqual([]);
  });
});

// The listing and the activation name only what the extension can do (audit DOC-02): a format comes with its
// preset, and its activation with it.
describe('package.json activation', () => {
  it('activates for the marker files of the presets, and for no format without one', () => {
    const markers = manifest.activationEvents
      .filter((event) => event.startsWith('workspaceContains:'))
      .map((event) => event.slice('workspaceContains:'.length));
    expect(markers).toEqual(PRESETS.flatMap((preset) => (preset.detect ? [preset.detect.glob] : [])));
  });

  it('names the .properties format once a preset reads it', () => {
    expect(manifest.keywords.includes('properties')).toBe(
      PRESETS.some((preset) => preset.format === 'properties'),
    );
  });
});

// An allow-list, so that a copy of the (GPL) edu-sharing files in any folder of the repository is never packed;
// the notices of the bundled packages must be packed (audit D-01, D-03). The changelog shows in the extension's
// details in VS Code.
describe('package.json files', () => {
  it('packs the build, the texts, the icon, the license, the notices and the changelog, and nothing else', () => {
    expect(manifest.files).toEqual([
      'dist/**/*.js',
      'dist/**/*.css',
      'l10n/**',
      'media/**',
      'package.nls*.json',
      'LICENSE',
      'ThirdPartyNotices.txt',
      'CHANGELOG.md',
    ]);
  });
});
