import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../src/core/area/presets';
import { formatMessage } from '../../../../src/core/checks/messages';
import {
  planAddLanguage,
  planEdit,
  type BundleEdit,
  type PlanResult,
} from '../../../../src/core/edit/planEdit';
import type { FileOp } from '../../../../src/core/formats/adapter';
import { jsonNestedAdapter } from '../../../../src/core/formats/json/jsonNested';
import { displayKey, keyFromSegments } from '../../../../src/core/model/keys';
import { analyzeFixtureWorkspace, analyzeTexts } from '../../support/fixtureWorkspace';

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

/** The planned changes as `file: operation` lines with paths below the i18n root, or the code of the problem. */
function summary(result: PlanResult): string[] | string {
  if (!result.ok) {
    // Every problem must fill its message template.
    expect(formatMessage(result.problem.message.template, result.problem.message.args)).not.toMatch(
      /\{\w+\}/,
    );
    return result.problem.code;
  }
  return result.changes.map((change) => {
    const path = change.relPath.replace(/^(.*\/)?i18n\//, '');
    return change.kind === 'create'
      ? `create ${path}: ${JSON.stringify(change.content)}`
      : `${path}: ${change.ops.map(describeOp).join(', ')}`;
  });
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

  it('adds a text whose parent objects are missing after the key before them', () => {
    expect(
      plan('common', {
        kind: 'setText',
        entryId: id('WORKSPACE.FILE.TITLE'),
        locale: 'fr',
        value: 'Fichier',
      }),
    ).toEqual(['common/fr.json: insert WORKSPACE.FILE.TITLE after WORKSPACE.TITLE = Fichier']);
  });

  it('adds a text after an object that precedes it in the reference', () => {
    const [order] = analyzeTexts({
      'order/de.json': '{\n  "A": "a",\n  "OBJ": {\n    "X": "x"\n  },\n  "NEW": "n"\n}\n',
      'order/fr.json': '{\n  "A": "a",\n  "OBJ": {\n    "X": "x"\n  }\n}\n',
    }).bundles;
    expect(
      summary(planEdit(order!, { kind: 'setText', entryId: id('NEW'), locale: 'fr', value: 'n' })),
    ).toEqual(['order/fr.json: insert NEW after OBJ = n']);
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

  it('plans nothing when a reference text that does not exist is cleared', () => {
    expect(plan('common', { kind: 'setText', entryId: id('OLD_KEY'), locale: 'de', value: '' })).toEqual([]);
  });

  it('needs a file for the language', () => {
    expect(plan('common', { kind: 'setText', entryId: id('SAVE'), locale: 'es', value: 'Guardar' })).toBe(
      'missing-file',
    );
  });

  it('leaves files with a syntax error alone', () => {
    expect(plan('broken', { kind: 'setText', entryId: id('b'), locale: 'de', value: 'x' })).toBe(
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

  it('refuses texts for keys the bundle no longer has, instead of creating them again', () => {
    expect(
      plan('common', { kind: 'setText', entryId: id('GONE'), locale: 'fr', value: 'x', before: null }),
    ).toBe('missing-key');
    expect(plan('common', { kind: 'setText', entryId: id('GONE'), locale: 'de', value: 'x' })).toBe(
      'missing-key',
    );
  });

  it('refuses a text where the file has an object with the same path', () => {
    const [mixed] = analyzeTexts({
      'mixed/de.json': '{\n  "FILE": "Datei"\n}\n',
      'mixed/fr.json': '{\n  "FILE": {\n    "TITLE": "Fichier"\n  }\n}\n',
    }).bundles;
    expect(
      summary(planEdit(mixed!, { kind: 'setText', entryId: id('FILE'), locale: 'fr', value: 'x' })),
    ).toBe('path-conflict');
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

  it('puts a new key after the nearest key at or before `after` that each file has', () => {
    expect(
      plan('common', {
        kind: 'addKey',
        key: key('NEW'),
        values: { de: 'Neu', en: 'New', fr: 'Nouveau' },
        after: id('CANCEL'),
      }),
    ).toEqual([
      'common/de.json: insert NEW after CANCEL = Neu',
      'common/en.json: insert NEW after CANCEL = New',
      'common/fr.json: insert NEW after SAVE = Nouveau',
    ]);
    expect(
      plan('common', {
        kind: 'addKey',
        key: key('WORKSPACE.FILE.NAME'),
        values: { de: 'Name', fr: 'Nom' },
        after: id('WORKSPACE.FILE.TITLE'),
      }),
    ).toEqual([
      'common/de.json: insert WORKSPACE.FILE.NAME after WORKSPACE.FILE.TITLE = Name',
      'common/fr.json: insert WORKSPACE.FILE.NAME after WORKSPACE.TITLE = Nom',
    ]);
  });

  it('needs a reference text for a new key', () => {
    expect(plan('common', { kind: 'addKey', key: key('NEW'), values: { en: 'New' } })).toBe(
      'reference-required',
    );
  });

  it('adds no key to a bundle without a file in the reference language', () => {
    const [unreferenced] = analyzeTexts({
      'loose/en.json': '{\n  "A": "a"\n}\n',
      'loose/fr.json': '{\n  "A": "a"\n}\n',
    }).bundles;
    expect(unreferenced!.reference).toBeUndefined();
    expect(summary(planEdit(unreferenced!, { kind: 'addKey', key: key('NEW'), values: { en: 'New' } }))).toBe(
      'no-reference',
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

  it('refuses renames into the path of the key itself, which would make it a text and an object at once', () => {
    expect(plan('common', { kind: 'renameKey', entryId: id('ASK'), to: key('ASK.TITLE') })).toBe(
      'path-conflict',
    );
    expect(
      plan('common', { kind: 'renameKey', entryId: id('WORKSPACE.FILE.TITLE'), to: key('WORKSPACE.FILE') }),
    ).toBe('path-conflict');
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

  it('deletes a nested key with the objects that become empty, but keeps parents with other keys', () => {
    const result = planEdit(bundle('common'), { kind: 'deleteKey', entryId: id('WORKSPACE.FILE.TITLE') });
    expect(summary(result)).toEqual([
      'common/de.json: delete WORKSPACE.FILE.TITLE',
      'common/en.json: delete WORKSPACE.FILE.TITLE',
    ]);
    // Applied the way the file store will apply it: FILE goes, WORKSPACE stays with its title.
    const de = bundle('common').file('de')!;
    const ops = result.ok
      ? result.changes.flatMap((change) =>
          change.kind === 'edit' && change.relPath === de.relPath ? change.ops : [],
        )
      : [];
    expect(jsonNestedAdapter.applyOps(de.doc, ops).text).toContain(
      '  "WORKSPACE": {\n    "TITLE": "Arbeitsbereich"\n  }\n}\n',
    );
  });

  it('leaves a key alone that is renamed to its own name', () => {
    expect(plan('common', { kind: 'renameKey', entryId: id('ASK'), to: key('ASK') })).toEqual([]);
  });

  it('changes no key while a file of the bundle has a syntax error', () => {
    expect(plan('broken', { kind: 'addKey', key: key('NEW'), values: { de: 'x' } })).toBe('unreadable-file');
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

  it('creates each file in the layout of the reference file', () => {
    const { bundles } = analyzeTexts({ 'crlf/de.json': '{\r\n  "A": "a"\r\n}\r\n' });
    expect(summary(planAddLanguage(bundles, ANGULAR_PRESET, 'fr'))).toEqual([
      'create crlf/fr.json: "{}\\r\\n"',
    ]);
  });

  it('refuses a language when the file pattern cannot write the path of a bundle', () => {
    const onlyCommon = { ...ANGULAR_PRESET, bundlePattern: 'common' };
    expect(summary(planAddLanguage(analysis.bundles, onlyCommon, 'es'))).toBe('invalid-locale');
  });

  it('refuses language codes that would turn into paths, whatever the pattern allows', () => {
    const permissive = { ...ANGULAR_PRESET, localePattern: '.+' };
    for (const locale of ['../x', 'de/x', 'de\\x', 'c:x', '.', '..']) {
      expect(summary(planAddLanguage(analysis.bundles, permissive, locale)), locale).toBe('invalid-locale');
    }
  });
});
