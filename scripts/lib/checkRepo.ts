import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AreaDefinition } from '../../src/core/area/areaDefinition';
import { formatMessage, ISSUE_MESSAGES } from '../../src/core/checks/messages';
import { analysisOptions, DEFAULT_SETTINGS } from '../../src/core/config/settings';
import type { Issue, RuleId, Severity } from '../../src/core/checks/types';
import { rootsFromMarkers } from '../../src/core/discovery/discover';
import { hasSyntaxError, type FileOp, type ParsedEntry } from '../../src/core/formats/adapter';
import { ADAPTERS } from '../../src/core/formats/registry';
import { VALUE_FIELD } from '../../src/core/model/types';
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
  /** Configuration problems of the area, e.g. two files for one locale. */
  warnings: string[];
}

export interface Report {
  roots: RootReport[];
  totals: Record<Severity, number>;
}

const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

export interface RoundTrip {
  files: number;
  /** Files whose bytes differ after reading and writing them back; none, if nothing is lost. */
  changed: string[];
  /** Files in which a text, set to itself, reads back otherwise; none, if the writers escape as the readers read. */
  unstable: string[];
}

/** Runs the check catalog of every preset over a repository checkout, with the extension's default settings. */
export function checkRepository(repositoryPath: string): Report {
  const paths = listFiles(repositoryPath);
  const { options } = analysisOptions(DEFAULT_SETTINGS);
  const roots: RootReport[] = [];
  for (const { area, root } of areaRoots(paths)) {
    const files = filesToRead(area, root, paths).map((relPath) => ({
      relPath,
      bytes: readFileSync(join(repositoryPath, relPath)),
    }));
    const analysis = analyzeRoot(area, root, files, options);
    roots.push(toRootReport(analysis));
  }
  const totals = { error: 0, warning: 0, info: 0 };
  for (const issue of roots.flatMap((root) => root.issues)) {
    totals[issue.severity]++;
  }
  return { roots, totals };
}

/**
 * Reads every translation file of the presets with its format adapter and writes it back: without an edit the
 * bytes must not change (encoding, byte order mark, escapes, line breaks); with every text set to itself, each
 * text must read back the same (the writer escapes what the reader unescapes).
 */
export function roundTrip(repositoryPath: string): RoundTrip {
  const paths = listFiles(repositoryPath);
  const result: RoundTrip = { files: 0, changed: [], unstable: [] };
  for (const { area, root } of areaRoots(paths)) {
    const adapter = ADAPTERS[area.format];
    for (const relPath of filesToRead(area, root, paths)) {
      const bytes = readFileSync(join(repositoryPath, relPath));
      const doc = adapter.decode(bytes);
      result.files++;
      if (!Buffer.from(adapter.encode(adapter.applyOps(doc, []))).equals(bytes)) {
        result.changed.push(relPath);
      }
      const parsed = adapter.parse(doc);
      if (hasSyntaxError(parsed)) {
        continue;
      }
      const ops: FileOp[] = parsed.entries.map((entry) => ({
        kind: 'set',
        key: entry.key,
        value: valueOf(entry),
      }));
      const again = adapter.parse(adapter.applyOps(doc, ops));
      const before = parsed.entries.map((entry) => [entry.key.id, valueOf(entry)]);
      const after = again.entries.map((entry) => [entry.key.id, valueOf(entry)]);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        result.unstable.push(relPath);
      }
    }
  }
  return result;
}

export function formatRoundTrip({ files, changed, unstable }: RoundTrip): string {
  if (changed.length === 0 && unstable.length === 0) {
    return `Round trip: ${plural(files, 'file')}, all byte-identical and stable`;
  }
  return [
    `Round trip: ${plural(files, 'file')}, ${changed.length} changed, ${unstable.length} unstable:`,
    ...changed.map((path) => `  changed: ${path}`),
    ...unstable.map((path) => `  unstable: ${path}`),
  ].join('\n');
}

function valueOf(entry: ParsedEntry): string {
  return entry.fields[VALUE_FIELD]!.value;
}

/** Every root of every preset in the checkout: detected by its marker, or as configured. */
function* areaRoots(paths: readonly string[]): Generator<{ area: AreaDefinition; root: string }> {
  for (const area of DEFAULT_SETTINGS.areas) {
    for (const root of area.detect ? rootsFromMarkers(paths, area.detect.marker) : area.roots) {
      yield { area, root };
    }
  }
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
    warnings: analysis.warnings,
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
    lines.push(...root.warnings.map((warning) => `  ! ${warning}`));
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
