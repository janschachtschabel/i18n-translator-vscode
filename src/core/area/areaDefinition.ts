import type { AreaId } from '../model/types';
import type { FilePatternSpec } from './filePattern';

/** File formats with an adapter. Further formats (properties, mail XML) arrive with their adapters. */
export const FORMAT_IDS = ['json-nested'] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

export const MERGE_SEMANTICS = ['shallow-toplevel', 'none'] as const;
export type MergeSemantics = (typeof MERGE_SEMANTICS)[number];

/** Declarative description of a translation area; presets and user settings share this shape. */
export interface AreaDefinition extends FilePatternSpec {
  id: AreaId;
  label: string;
  format: FormatId;
  /** Workspace-relative root folders; empty means: find them via {@link AreaDefinition.detect}. */
  roots: string[];
  /** Overrides the global reference language for this area. */
  referenceLanguage?: string;
  /** Order in which the runtime merges the bundles of one locale (edu-sharing: TRANSLATION_LIST). */
  bundleOrder?: string[];
  /**
   * `shallow-toplevel`: the runtime merges all bundles of a locale by top-level key, later bundles win
   * (edu-sharing's Angular translation loader). Enables the override rules.
   */
  mergeSemantics?: MergeSemantics;
  /** Finds roots automatically: every match of `glob` minus the trailing `marker` path is a root. */
  detect?: { glob: string; marker: string };
}
