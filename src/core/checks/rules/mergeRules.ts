import type { Bundle } from '../../model/bundle';
import { displayKey, type EntryKey } from '../../model/keys';
import type { LocaleCode } from '../../model/types';
import type { CheckContext, Finding, Rule } from '../types';
import { finding, isReadable, keyLocation } from './support';

interface MergeConflict {
  kind: 'overridden' | 'lost';
  bundle: Bundle;
  winner: Bundle;
  locale: LocaleCode;
  key: EntryKey;
}

/**
 * Replays edu-sharing's translation loader: per locale, the bundles in `bundleOrder` are merged by
 * top-level key and a later bundle replaces the whole top-level value. Bundles outside the order are
 * not loaded at runtime and take no part.
 */
function simulateMerge(ctx: CheckContext): MergeConflict[] {
  if (ctx.area.mergeSemantics !== 'shallow-toplevel' || !ctx.area.bundleOrder) {
    return [];
  }
  const byName = new Map(ctx.bundles.map((bundle) => [bundle.name, bundle]));
  const ordered = ctx.area.bundleOrder.flatMap((name) => byName.get(name) ?? []);
  const locales = [...new Set(ordered.flatMap((bundle) => bundle.locales))].sort();

  const conflicts: MergeConflict[] = [];
  for (const locale of locales) {
    const loaded = ordered.filter((bundle) => isReadable(bundle, locale));
    const winners = new Map<string, Bundle>();
    for (const bundle of loaded) {
      for (const topKey of bundle.file(locale)!.parsed.topLevelKeys) {
        winners.set(topKey, bundle);
      }
    }
    for (const bundle of loaded) {
      for (const { key, fields } of bundle.file(locale)!.parsed.entries) {
        const winner = winners.get(key.segments[0]!)!;
        if (winner === bundle) {
          continue;
        }
        const winningText = winner.value(key.id, locale);
        if (winningText === undefined) {
          conflicts.push({ kind: 'lost', bundle, winner, locale, key });
        } else if (winningText !== fields.value?.value) {
          conflicts.push({ kind: 'overridden', bundle, winner, locale, key });
        }
      }
    }
  }
  return conflicts;
}

function conflictFindings(ctx: CheckContext, kind: MergeConflict['kind']): Finding[] {
  return simulateMerge(ctx)
    .filter((conflict) => conflict.kind === kind)
    .map(({ bundle, winner, locale, key }) =>
      finding(kind === 'lost' ? 'subtree-lost' : 'key-overridden', bundle, {
        locale,
        key,
        args: { key: displayKey(key), winner: winner.name, topKey: key.segments[0]! },
        location: keyLocation(bundle, locale, key),
      }),
    );
}

/** The same key with a different text in a later bundle: the later text applies to the whole app. */
export const keyOverriddenRule: Rule = {
  id: 'key-overridden',
  defaultSeverity: 'warning',
  run: (ctx) => conflictFindings(ctx, 'overridden'),
};

/** A later bundle redefines the top-level key and lacks this leaf: the text is unreachable at runtime. */
export const subtreeLostRule: Rule = {
  id: 'subtree-lost',
  defaultSeverity: 'error',
  run: (ctx) => conflictFindings(ctx, 'lost'),
};
