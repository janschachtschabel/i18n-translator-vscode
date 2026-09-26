import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET, MDS_PRESET } from '../../../../src/core/area/presets';
import { checkNewKey, newKeyProblem } from '../../../../src/core/edit/keyCheck';
import { keyFromSegments, type EntryKey } from '../../../../src/core/model/keys';
import { analyzeFixtureWorkspace, analyzeTexts } from '../../support/fixtureWorkspace';

const { analysis } = analyzeFixtureWorkspace();
const bundle = (name: string) => analysis.bundles.find((candidate) => candidate.name === name)!;
const key = (dotted: string) => keyFromSegments(dotted.split('.'));
const problemOf = (candidate: EntryKey) => newKeyProblem(candidate, bundle('common'))?.code;

describe('newKeyProblem', () => {
  it('accepts a key the bundle does not have', () => {
    expect(problemOf(key('BRAND_NEW'))).toBeUndefined();
    expect(problemOf(key('WORKSPACE.NEW'))).toBeUndefined();
  });

  it('refuses keys that exist or collide with a text', () => {
    expect(problemOf(key('ASK'))).toBe('key-exists');
    expect(problemOf(key('ASK.MORE'))).toBe('path-conflict');
    expect(problemOf(key('WORKSPACE'))).toBe('path-conflict');
    expect(problemOf(key('WORKSPACE.FILE'))).toBe('path-conflict');
  });

  it('needs a name for every part of the key', () => {
    expect(problemOf(keyFromSegments(['A', ' ']))).toBe('invalid-key');
    // Keys can arrive as plain objects (e.g. from the webview), which keyFromSegments has not checked.
    expect(problemOf({ id: '[]', segments: [] })).toBe('invalid-key');
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

  it('warns only where bundles are merged, and only within one root', () => {
    const merged = { ...ANGULAR_PRESET, mergeSemantics: 'none' as const };
    expect(checkNewKey(key('WORKSPACE.NEW'), bundle('admin'), analysis.bundles, merged).warnings).toEqual([]);
    const elsewhere = { ...bundle('common'), id: '["other"]', root: 'Other/src/assets/i18n' };
    expect(
      checkNewKey(key('WORKSPACE.NEW'), bundle('admin'), [bundle('admin'), elsewhere], ANGULAR_PRESET)
        .warnings,
    ).toEqual([]);
  });

  it('reports the same problems as planning', () => {
    expect(checkNewKey(key('ASK'), bundle('admin'), analysis.bundles, ANGULAR_PRESET).problem?.code).toBe(
      'key-exists',
    );
  });
});

describe('newKeyProblem in an area with hidden keys and flat keys', () => {
  const GUARD = 'this_is_a_bug_the_first_line_will_not_be_translated';
  const texts = (guard: boolean) => ({
    'mds_de_DE.properties': `${guard ? `${GUARD}: guard\n` : ''}a: A\n`,
  });

  it('refuses the name of a hidden key, whether the files have it or not', () => {
    for (const guard of [true, false]) {
      const mds = analyzeTexts(texts(guard), MDS_PRESET).bundles[0]!;
      expect(newKeyProblem(keyFromSegments([GUARD]), mds)?.code, String(guard)).toBe('hidden-key');
    }
  });

  it('asks a flat key for a name, not for a name of every part', () => {
    const mds = analyzeTexts(texts(false), MDS_PRESET).bundles[0]!;
    expect(newKeyProblem(keyFromSegments(['']), mds)?.code).toBe('empty-key');
  });
});
