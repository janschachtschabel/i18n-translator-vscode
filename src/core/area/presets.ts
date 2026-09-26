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
  // Loaded last, it replaces texts of the other categories: it holds only what it changes.
  overrideBundlePattern: 'override',
  detect: { glob: '**/common/de.json', marker: 'common/de.json' },
};

/**
 * Metadataset translations of edu-sharing (`config/defaults/src/main/resources/metadatasets/i18n/`): one bundle per
 * group, `{group}.properties` is the English base file (`default`), `{group}_{locale}.properties` the languages.
 * The first line of the main files is a guard: edu-sharing never reads it, so it stays hidden and first. Placeholders
 * have one brace.
 */
export const MDS_PRESET: AreaDefinition = {
  id: 'edu-sharing.mds',
  label: 'Metadatasets',
  format: 'properties',
  roots: [],
  files: '{bundle}[_{locale}].properties',
  localePattern: '[a-z]{2}_[A-Z]{2}',
  ignoredKeys: ['this_is_a_bug_the_first_line_will_not_be_translated'],
  // edu-sharing fills `{user}` and the like there; only `{{GENDER_SEPARATOR}}` keeps two braces.
  placeholderSyntax: 'single-brace',
  // MetadataReader reads `{group}_override_{locale}` before `{group}_{locale}`, and `{group}_override` before
  // `{group}`: such files hold only what they change.
  overrideBundlePattern: '.+_override',
  detect: { glob: '**/metadatasets/i18n/mds.properties', marker: 'mds.properties' },
};

/**
 * Mail templates of edu-sharing (`config/defaults/src/main/resources/mailtemplates/`): one bundle `templates`;
 * `templates.xml` is the English base file (`default`), `templates_{locale}.xml` the languages. Subject and message of
 * every template are the texts. Override files (`templates_de_DE_override.xml`) do not belong to it.
 */
export const MAIL_PRESET: AreaDefinition = {
  id: 'edu-sharing.mail',
  label: 'Mail templates',
  format: 'mail-xml',
  roots: [],
  files: 'templates[_{locale}].xml',
  localePattern: '[a-z]{2}_[A-Z]{2}',
  bundleName: 'templates',
  detect: { glob: '**/mailtemplates/templates.xml', marker: 'templates.xml' },
};

export const PRESETS: readonly AreaDefinition[] = [ANGULAR_PRESET, MDS_PRESET, MAIL_PRESET];
