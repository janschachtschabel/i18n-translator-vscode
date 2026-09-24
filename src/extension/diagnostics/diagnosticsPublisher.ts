import * as vscode from 'vscode';
import { toProblems, type Problem, type ProblemLocation } from '../../core/report/problems';
import { localize } from '../localize';
import type { IndexSnapshot, WorkspaceIndex } from '../services/workspaceIndex';

/** Shown next to the rule id of every diagnostic, so users can filter the Problems panel by it. */
export const DIAGNOSTIC_SOURCE = 'edu-sharing i18n';

/** Shows the errors and warnings of the latest index run in the Problems panel. */
export class DiagnosticsPublisher implements vscode.Disposable {
  private readonly subscription: vscode.Disposable;

  constructor(
    index: WorkspaceIndex,
    private readonly collection = vscode.languages.createDiagnosticCollection('eduI18n'),
  ) {
    this.subscription = index.onDidChange((snapshot) => this.publish(snapshot));
    const current = index.current();
    if (current) {
      this.publish(current);
    }
  }

  dispose(): void {
    this.subscription.dispose();
    this.collection.dispose();
  }

  private publish(snapshot: IndexSnapshot): void {
    const byFile = new Map<string, [vscode.Uri, vscode.Diagnostic[]]>();
    for (const { folder, settings, analysis } of snapshot.roots) {
      const uriOf = (location: ProblemLocation) => vscode.Uri.joinPath(folder.uri, location.relPath);
      for (const problem of toProblems(analysis, settings.missingDiagnostics)) {
        const uri = uriOf(problem.location);
        const entry = byFile.get(uri.toString()) ?? [uri, []];
        entry[1].push(toDiagnostic(problem, uriOf));
        byFile.set(uri.toString(), entry);
      }
    }
    const stale: vscode.Uri[] = [];
    this.collection.forEach((uri) => {
      if (!byFile.has(uri.toString())) {
        stale.push(uri);
      }
    });
    for (const uri of stale) {
      this.collection.delete(uri);
    }
    // One call per file: VS Code syncs at most 1,100 diagnostics per call and silently drops the files after that.
    for (const [uri, diagnostics] of byFile.values()) {
      this.collection.set(uri, diagnostics);
    }
  }
}

function toDiagnostic(problem: Problem, uriOf: (location: ProblemLocation) => vscode.Uri): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    toRange(problem.location),
    localize(problem.message),
    problem.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.code = problem.rule;
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.relatedInformation = problem.related.map(
    (related) =>
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(uriOf(related.location), toRange(related.location)),
        related.label,
      ),
  );
  return diagnostic;
}

function toRange({ start, end }: ProblemLocation): vscode.Range {
  return new vscode.Range(start.line, start.character, end.line, end.character);
}
