import { ANGULAR_PRESET } from '../../../../../src/core/area/presets';
import type { AreaDefinition } from '../../../../../src/core/area/areaDefinition';
import { compileVariants, DEFAULT_VARIANTS } from '../../../../../src/core/checks/variants';
import type { CheckContext, Finding, Rule } from '../../../../../src/core/checks/types';
import { jsonNestedAdapter } from '../../../../../src/core/formats/json/jsonNested';
import { buildBundle, parseBundleId, type Bundle } from '../../../../../src/core/model/bundle';
import { displayKey, keyFromId } from '../../../../../src/core/model/keys';

/** Builds a bundle of the Angular preset from `{ locale: jsonText }`. */
export function bundleOf(
  name: string,
  files: Record<string, string>,
  area: AreaDefinition = ANGULAR_PRESET,
): Bundle {
  return buildBundle(
    area,
    'i18n',
    name,
    Object.entries(files).map(([locale, text]) => {
      const doc = { text, encoding: 'utf-8' as const, bom: false };
      return { locale, relPath: `i18n/${name}/${locale}.json`, doc, parsed: jsonNestedAdapter.parse(doc) };
    }),
    { referenceLanguage: 'de', baseFileLanguage: 'en' },
  );
}

export function contextOf(bundles: Bundle[], area: AreaDefinition = ANGULAR_PRESET): CheckContext {
  return {
    area,
    bundles,
    variants: compileVariants(DEFAULT_VARIANTS).variants,
    ignoreSameAsReference: ['OK', 'E-Mail', 'CC-0', 'ID'],
  };
}

/** Compact view of findings for assertions: `bundle/locale key` plus selected arguments. */
export function summarize(findings: Finding[], ...argNames: string[]): string[] {
  return findings.map((finding) => {
    const bundle = parseBundleId(finding.bundleId).name;
    const key = finding.entryId ? ` ${displayKey(keyFromId(finding.entryId))}` : '';
    const args = argNames.map((name) => ` ${name}=${JSON.stringify(finding.args[name])}`).join('');
    return `${finding.rule} ${bundle}/${finding.locale ?? '-'}${key}${args}`;
  });
}

export function run(rule: Rule, bundles: Bundle[]): Finding[] {
  return rule.run(contextOf(bundles));
}
