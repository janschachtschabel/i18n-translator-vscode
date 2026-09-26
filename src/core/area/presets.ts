import type { AreaDefinition } from './areaDefinition';

/**
 * Angular JSON files of the edu-sharing frontend (`Frontend/src/assets/i18n/{category}/{locale}.json`).
 * `bundleOrder` mirrors TRANSLATION_LIST in edu-sharing's translation-loader.ts.
 */
export const ANGULAR_PRESET: AreaDefinition = {
  id: 'edu-sharing.angular',
  label: 'Angular JSON',
  format: 'json-nested',
  roots: [],
  files: '{bundle}/{locale}.json',
  localePattern: '[a-z]{2}(?:-[a-z0-9]+)*',
  bundleOrder: [
    'common',
    'admin',
    'recycle',
    'workspace',
    'search',
    'collections',
    'editorial',
    'login',
    'permissions',
    'oer',
    'messages',
    'register',
    'topic-page',
    'profiles',
    'services',
    'stream',
    'override',
  ],
  mergeSemantics: 'shallow-toplevel',
  detect: { glob: '**/common/de.json', marker: 'common/de.json' },
};

export const PRESETS: readonly AreaDefinition[] = [ANGULAR_PRESET];
