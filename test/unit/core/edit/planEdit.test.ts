import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { formatMessage } from '../../../../src/core/checks/messages';
import { checkNewKey } from '../../../../src/core/edit/keyCheck';
import {
  planAddLanguage,
  planEdit,
  type BundleEdit,
  type PlanResult,
} from '../../../../src/core/edit/planEdit';
import type { FileOp } from '../../../../src/core/formats/adapter';
import { displayKey, keyFromSegments } from '../../../../src/core/model/keys';
import { analyzeFixtureWorkspace } from '../../support/fixtureWorkspace';

const ROOT = 'Frontend/src/assets/i18n/';
const { analysis } = analyzeFixtureWorkspace();
const bundle = (name: string) => analysis.bundles.find((candidate) => candidate.name === name)!;
const key = (dotted: string) => keyFromSegments(dotted.split('.'));
const id = (dotted: string) => key(dotted).id;

function describeOp(op: FileOp): string {
  switch (op.kind) {
    case 'set':
      return `set ${displayKey(op.key)} = ${op.value}`;
    case 'insert':
      return `insert ${displayKey(op.key)}${op.after ? ` after ${displayKey(op.after)}` : ''} = ${op.value}`;
    case 'delete':
      return `delete ${displayKey(op.key)}`;
    case 'rename':
      return `rename ${displayKey(op.from)} -> ${displayKey(op.to)}`;
  }
}

/** The planned changes as `file: operation` lines, or the code of the problem. */
function summary(result: PlanResult): string[] | string {
  if (!result.ok) {
    // Every problem must fill its message template.
    expect(formatMessage(result.problem.message.template, result.problem.message.args)).not.toMatch(
      /\{\w+\}/,
    );
    return result.problem.code;
  }
  return result.changes.map((change) =>
    change.kind === 'create'
      ? `create ${change.relPath.slice(ROOT.length)}: ${JSON.stringify(change.content)}`
      : `${change.relPath.slice(ROOT.length)}: ${change.ops.map(describeOp).join(', ')}`,
  );
}

const plan = (name: string, edit: BundleEdit) => summary(planEdit(bundle(name), edit));

describe('planEdit: setText', () => {
  it('changes an existing text', () => {
    expect(
      plan('common', { kind: 'setText', entryId: id('ASK'), locale: 'fr', value: 'Continuer ?' }),
    ).toEqual(['common/fr.json: set ASK = Continuer ?']);
  });

  it('adds a missing text after the key that precedes it in the reference', () => {
    expect(
      plan('common', { kind: 'setText', entryId: id('CANCEL'), locale: 'fr', value: 'Annuler' }),
    ).toEqual(['common/fr.json: insert CANCEL after SAVE = Annuler']);
  });

  it('adds a text whose parent objects are missing', () => {
    expect(
      plan('common', {
        kind: 'setText',
        entryId: id('WORKSPACE.FILE.TITLE'),
        locale: 'fr',
        value: 'Fichier',
      }),
    ).toEqual(['common/fr.json: insert WORKSPACE.FILE.TITLE = Fichier']);
  });

  it('deletes a cleared translation, so that the fallback applies', () => {
    expect(plan('common', { kind: 'setText', entryId: id('ASK'), locale: 'fr', value: '' })).toEqual([
      'common/fr.json: delete ASK',
    ]);
    expect(plan('common', { kind: 'setText', entryId: id('SAVE'), locale: 'fr', value: '' })).toEqual([
      'common/fr.json: delete SAVE',
    ]);
  });

  it('plans nothing when nothing changes', () => {
    expect(
      plan('common', { kind: 'setText', entryId: id('ASK'), locale: 'de', value: 'Möchten Sie fortfahren?' }),
    ).toEqual([]);
    expect(plan('common', { kind: 'setText', entryId: id('CANCEL'), locale: 'fr', value: '' })).toEqual([]);
  });

  it('refuses to empty the reference text', () => {
    expect(plan('common', { kind: 'setText', entryId: id('SAVE'), locale: 'de', value: '' })).toBe(
      'reference-empty',
    );
  });

  it('needs a file for the language', () => {
    expect(plan('common', { kind: 'setText', entryId: id('SAVE'), locale: 'es', value: 'Guardar' })).toBe(
      'missing-file',
    );
  });

  it('leaves files with a syntax error alone', () => {
    expect(plan('broken', { kind: 'setText', entryId: id('a'), locale: 'de', value: 'x' })).toBe(
      'unreadable-file',
    );
  });

  it('notices a text that changed after the user saw it', () => {
    const edit = { kind: 'setText', entryId: id('SAVE'), locale: 'fr', value: 'Enregistrer' } as const;
    expect(plan('common', { ...edit, before: '' })).toEqual(['common/fr.json: set SAVE = Enregistrer']);
    expect(plan('common', { ...edit, before: 'Sauver' })).toBe('changed');
    expect(plan('common', { ...edit, before: null })).toBe('changed');
    expect(
      plan('common', {
        kind: 'setText',
        entryId: id('CANCEL'),
        locale: 'fr',
        value: 'Annuler',
        before: null,
      }),
    ).toEqual(['common/fr.json: insert CANCEL after SAVE = Annuler']);
  });

  it('refuses a text where the file already has an object', () => {
    expect(plan('common', { kind: 'setText', entryId: id('FILE'), locale: 'it', value: 'x' })).toBe(
      'path-conflict',
    );
  });
});

describe('planEdit: keys', () => {
  it('adds a new key with its texts and skips empty ones', () => {
    expect(
      plan('common', {
        kind: 'addKey',
        key: key('NEW'),
        values: { de: 'Neu', en: 'New', fr: '' },
        after: id('SAVE'),
      }),
    ).toEqual(['common/de.json: insert NEW after SAVE = Neu', 'common/en.json: insert NEW after SAVE = New']);
  });

  it('needs a reference text for a new key', () => {
    expect(plan('common', { kind: 'addKey', key: key('NEW'), values: { en: 'New' } })).toBe(
      'reference-empty',
    );
  });

  it('refuses keys that exist or collide with texts', () => {
    const add = (dotted: string) => plan('common', { kind: 'addKey', key: key(dotted), values: { de: 'x' } });
    expect(add('ASK')).toBe('key-exists');
    expect(add('ASK.MORE')).toBe('path-conflict');
    expect(add('WORKSPACE')).toBe('path-conflict');
    expect(plan('common', { kind: 'addKey', key: keyFromSegments(['A', ' ']), values: { de: 'x' } })).toBe(
      'invalid-key',
    );
  });

  it('needs a file for every language with a text', () => {
    expect(plan('common', { kind: 'addKey', key: key('NEW'), values: { de: 'Neu', es: 'Nuevo' } })).toBe(
      'missing-file',
    );
  });

  it('renames a key in every file that has it', () => {
    const files = bundle('common')
      .locales.filter((locale) => bundle('common').value(id('ASK'), locale) !== undefined)
      .map((locale) => `common/${locale}.json: rename ASK -> QUESTION`);
    expect(plan('common', { kind: 'renameKey', entryId: id('ASK'), to: key('QUESTION') })).toEqual(files);
    expect(files.length).toBeGreaterThan(2);
  });

  it('refuses renames onto existing keys and of missing keys', () => {
    expect(plan('common', { kind: 'renameKey', entryId: id('ASK'), to: key('SAVE') })).toBe('key-exists');
    expect(plan('common', { kind: 'renameKey', entryId: id('NOPE'), to: key('X') })).toBe('missing-key');
  });

  it('deletes a key in every file that has it', () => {
    expect(plan('common', { kind: 'deleteKey', entryId: id('OLD_KEY') })).toEqual([
      'common/it.json: delete OLD_KEY',
    ]);
  });

  it('changes no key while a file of the bundle has a syntax error', () => {
    expect(plan('broken', { kind: 'deleteKey', entryId: id('b') })).toBe('unreadable-file');
    expect(plan('broken', { kind: 'renameKey', entryId: id('b'), to: key('c') })).toBe('unreadable-file');
  });
});

describe('planAddLanguage', () => {
  const add = (locale: string) => summary(planAddLanguage(analysis.bundles, ANGULAR_PRESET, locale));

  it('creates an empty file in every bundle, without keys', () => {
    expect(add('es')).toEqual([
      'create admin/es.json: "{}\\n"',
      'create broken/es.json: "{}\\n"',
      'create common/es.json: "{}\\n"',
      'create editorial/es.json: "{}\\n"',
    ]);
  });

  it('creates only the files that are missing', () => {
    expect(add('fr')).toEqual(['create admin/fr.json: "{}\\n"', 'create editorial/fr.json: "{}\\n"']);
  });

  it('refuses invalid language codes and languages every bundle has', () => {
    expect(add('ES')).toBe('invalid-locale');
    expect(add('de')).toBe('locale-exists');
  });
});

describe('checkNewKey', () => {
  it('warns when another bundle has the same top-level key, which one of them replaces at runtime', () => {
    const check = checkNewKey(key('WORKSPACE.NEW'), bundle('admin'), analysis.bundles, ANGULAR_PRESET);
    expect(check.problem).toBeUndefined();
    expect(check.warnings.map((warning) => [warning.code, warning.message.args])).toEqual([
      ['exists-in-other-bundle', { top: 'WORKSPACE', bundles: 'common' }],
    ]);
  });

  it('accepts new top-level keys without a warning', () => {
    expect(checkNewKey(key('BRAND_NEW'), bundle('admin'), analysis.bundles, ANGULAR_PRESET)).toEqual({
      warnings: [],
    });
  });

  it('reports the same problems as planning', () => {
    expect(checkNewKey(key('ASK'), bundle('admin'), analysis.bundles, ANGULAR_PRESET).problem?.code).toBe(
      'key-exists',
    );
  });
});
