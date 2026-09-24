import { describe, expect, it } from 'vitest';
import { ANGULAR_PRESET } from '../../../../../src/core/area/presets';
import { keyOverriddenRule, subtreeLostRule } from '../../../../../src/core/checks/rules/mergeRules';
import { bundleOf, contextOf, run, summarize } from './helpers';

describe('key-overridden', () => {
  it('reports a top-level key that a later category redefines with a different text', () => {
    const common = bundleOf('common', { de: '{"ASK":"Möchten Sie fortfahren?"}' });
    const admin = bundleOf('admin', { de: '{"ASK":"Wollen Sie wirklich fortfahren?"}' });
    const findings = run(keyOverriddenRule, [admin, common]);
    expect(summarize(findings, 'winner')).toEqual(['key-overridden common/de ASK winner="admin"']);
    expect(findings[0]?.location).toEqual({ relPath: 'i18n/common/de.json', range: [1, 6] });
  });

  it('ignores identical texts', () => {
    const common = bundleOf('common', { de: '{"OK":"OK"}' });
    const admin = bundleOf('admin', { de: '{"OK":"OK"}' });
    expect(run(keyOverriddenRule, [common, admin])).toEqual([]);
  });
});

describe('subtree-lost', () => {
  it('reports leaves of an earlier category that a later top-level object hides', () => {
    const common = bundleOf('common', { de: '{"W":{"a":"1","b":"2"}}' });
    const workspace = bundleOf('workspace', { de: '{"W":{"a":"1"}}' });
    expect(summarize(run(subtreeLostRule, [common, workspace]), 'winner', 'topKey')).toEqual([
      'subtree-lost common/de W.b winner="workspace" topKey="W"',
    ]);
    expect(run(keyOverriddenRule, [common, workspace])).toEqual([]);
  });

  it('treats an empty object in a later category as replacing the whole subtree', () => {
    const common = bundleOf('common', { de: '{"X":{"a":"1"}}' });
    const admin = bundleOf('admin', { de: '{"X":{}}' });
    expect(summarize(run(subtreeLostRule, [common, admin]))).toEqual(['subtree-lost common/de X.a']);
  });

  it('merges each locale separately, variants included', () => {
    const common = bundleOf('common', { de: '{}', 'de-informal': '{"X":{"a":"A"}}' });
    const admin = bundleOf('admin', { de: '{}', 'de-informal': '{"X":{"b":"B"}}' });
    expect(summarize(run(subtreeLostRule, [common, admin]))).toEqual(['subtree-lost common/de-informal X.a']);
  });
});

describe('merge simulation scope', () => {
  it('ignores categories the runtime does not load', () => {
    const common = bundleOf('common', { de: '{"X":"1"}' });
    const custom = bundleOf('custom', { de: '{"X":"2"}' });
    expect(run(keyOverriddenRule, [common, custom])).toEqual([]);
  });

  it('does nothing for areas without shallow merge semantics', () => {
    const area = { ...ANGULAR_PRESET, mergeSemantics: 'none' as const };
    const bundles = [
      bundleOf('common', { de: '{"X":"1"}' }, area),
      bundleOf('admin', { de: '{"X":"2"}' }, area),
    ];
    expect(keyOverriddenRule.run(contextOf(bundles, area))).toEqual([]);
  });
});
