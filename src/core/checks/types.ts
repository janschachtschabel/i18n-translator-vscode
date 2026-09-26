import type { AreaDefinition } from '../area/areaDefinition';
import type { TextRange } from '../formats/adapter';
import type { Bundle } from '../model/bundle';
import type { AreaId, BundleId, LocaleCode } from '../model/types';
import type { CompiledVariant } from './variants';

export type Severity = 'error' | 'warning' | 'info';

export const RULE_IDS = [
  'parse-error',
  'non-string-value',
  'duplicate-key',
  'not-utf8',
  'missing-file',
  'missing-key',
  'empty-value',
  'orphan-key',
  'misplaced-key',
  'placeholder-malformed',
  'placeholder-mismatch',
  'html-mismatch',
  'variant-needed',
  'variant-inconsistent',
  'variant-orphan',
  'key-overridden',
  'subtree-lost',
  'same-as-reference',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Values for the message template of a rule; lists are joined when formatted. */
export type IssueArgs = Record<string, string | number | readonly string[]>;

export interface IssueLocation {
  /** Workspace-relative path with `/` separators. */
  relPath: string;
  range?: TextRange;
}

export interface Issue {
  rule: RuleId;
  severity: Severity;
  areaId: AreaId;
  bundleId: BundleId;
  locale?: LocaleCode;
  /** {@link EntryKey.id} of the affected entry. */
  entryId?: string;
  args: IssueArgs;
  location?: IssueLocation;
}

/** What a rule reports; the runner adds the configured severity. */
export type Finding = Omit<Issue, 'severity'>;

export interface CheckContext {
  area: AreaDefinition;
  bundles: readonly Bundle[];
  variants: ReadonlyMap<LocaleCode, CompiledVariant>;
  /** Texts that may legitimately equal the reference (`OK`, `E-Mail`, …). */
  ignoreSameAsReference: readonly string[];
}

export interface Rule {
  id: RuleId;
  defaultSeverity: Severity;
  run(ctx: CheckContext): Finding[];
}

export type SeverityOverrides = Partial<Record<RuleId, Severity | 'off'>>;
