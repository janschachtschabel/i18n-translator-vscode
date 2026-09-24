import type { CheckContext, Issue, Rule, SeverityOverrides } from './types';

/** Runs the rules with their configured severity; rules switched `off` are skipped. Output order is deterministic. */
export function runChecks(
  ctx: CheckContext,
  rules: readonly Rule[],
  overrides: SeverityOverrides = {},
): Issue[] {
  const issues: Issue[] = [];
  for (const rule of rules) {
    const severity = overrides[rule.id] ?? rule.defaultSeverity;
    if (severity === 'off') {
      continue;
    }
    for (const finding of rule.run(ctx)) {
      issues.push({ ...finding, severity });
    }
  }
  return issues.sort(compareIssues);
}

function compareIssues(a: Issue, b: Issue): number {
  return (
    compareText(a.areaId, b.areaId) ||
    compareText(a.bundleId, b.bundleId) ||
    compareText(a.locale ?? '', b.locale ?? '') ||
    (a.location?.range?.[0] ?? -1) - (b.location?.range?.[0] ?? -1) ||
    compareText(a.rule, b.rule) ||
    compareText(a.entryId ?? '', b.entryId ?? '')
  );
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
