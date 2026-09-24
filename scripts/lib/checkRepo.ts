import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRESETS } from '../../src/core/area/presets';
import { formatMessage, ISSUE_MESSAGES } from '../../src/core/checks/messages';
import type { Issue, RuleId, Severity } from '../../src/core/checks/types';
import { compileVariants, DEFAULT_VARIANTS } from '../../src/core/checks/variants';
import { rootsFromMarkers } from '../../src/core/discovery/discover';
import { analyzeRoot, filesToRead, type RootAnalysis } from '../../src/core/pipeline/analyze';
import { createLineIndex, type LineIndex } from '../../src/core/text/lineIndex';
import { listFiles } from './fsScan';

export interface ReportIssue {
  rule: RuleId;
  severity: Severity;
  message: string;
  file?: string;
  /** 1-based. */
  line?: number;
}

export interface RootReport {
  areaId: string;
  root: string;
  bundles: number;
  rules: Partial<Record<RuleId, number>>;
  issues: ReportIssue[];
}

export interface Report {
  roots: RootReport[];
  totals: Record<Severity, number>;
}

const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

/** Runs the check catalog of every preset over a repository checkout (edu-sharing defaults). */
export function checkRepository(repositoryPath: string): Report {
  const paths = listFiles(repositoryPath);
  const variants = compileVariants(DEFAULT_VARIANTS).variants;
  const roots: RootReport[] = [];
  for (const area of PRESETS) {
    const areaRoots = area.detect ? rootsFromMarkers(paths, area.detect.marker) : area.roots;
    for (const root of areaRoots) {
      const files = filesToRead(area, root, paths).map((relPath) => ({
        relPath,
        bytes: readFileSync(join(repositoryPath, relPath)),
      }));
      const analysis = analyzeRoot(area, root, files, {
        referenceLanguage: 'de',
        baseFileLanguage: 'en',
        variants,
        severityOverrides: {},
        ignoreSameAsReference: ['OK', 'E-Mail', 'CC-0', 'ID'],
      });
      roots.push(toRootReport(analysis));
    }
  }
  const totals = { error: 0, warning: 0, info: 0 };
  for (const issue of roots.flatMap((root) => root.issues)) {
    totals[issue.severity]++;
  }
  return { roots, totals };
}

function toRootReport(analysis: RootAnalysis): RootReport {
  const lineIndexes = new Map<string, LineIndex>();
  for (const bundle of analysis.bundles) {
    for (const locale of bundle.locales) {
      const file = bundle.file(locale)!;
      lineIndexes.set(file.relPath, createLineIndex(file.doc.text));
    }
  }
  const rules: Partial<Record<RuleId, number>> = {};
  for (const issue of analysis.issues) {
    rules[issue.rule] = (rules[issue.rule] ?? 0) + 1;
  }
  return {
    areaId: analysis.area.id,
    root: analysis.root,
    bundles: analysis.bundles.length,
    rules,
    issues: analysis.issues.map((issue) => toReportIssue(issue, lineIndexes)),
  };
}

function toReportIssue(issue: Issue, lineIndexes: ReadonlyMap<string, LineIndex>): ReportIssue {
  const file = issue.location?.relPath;
  const start = issue.location?.range?.[0];
  const line = file && start !== undefined ? lineIndexes.get(file)?.positionAt(start).line : undefined;
  return {
    rule: issue.rule,
    severity: issue.severity,
    message: formatMessage(ISSUE_MESSAGES[issue.rule], issue.args),
    ...(file ? { file } : {}),
    ...(line !== undefined ? { line: line + 1 } : {}),
  };
}

/** Human-readable summary: per root the rules by severity, with up to three examples each. */
export function formatReport(report: Report, examplesPerRule = 3): string {
  const lines: string[] = [];
  for (const root of report.roots) {
    lines.push(`${root.areaId} · ${root.root || '.'} · ${root.bundles} bundles`);
    const rules = (Object.keys(root.rules) as RuleId[]).map((rule) => ({
      rule,
      severity: root.issues.find((issue) => issue.rule === rule)!.severity,
    }));
    rules.sort(
      (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || (a.rule < b.rule ? -1 : 1),
    );
    for (const { rule, severity } of rules) {
      lines.push(`  ${rule.padEnd(24)}${severity.padEnd(9)}${String(root.rules[rule]).padStart(6)}`);
      for (const issue of root.issues
        .filter((candidate) => candidate.rule === rule)
        .slice(0, examplesPerRule)) {
        const where = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}  ` : '';
        lines.push(`      ${where}${issue.message}`);
      }
    }
    lines.push('');
  }
  const { error, warning, info } = report.totals;
  lines.push(`Total: ${plural(error, 'error')}, ${plural(warning, 'warning')}, ${plural(info, 'info')}`);
  return lines.join('\n');
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
