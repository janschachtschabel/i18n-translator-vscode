import * as vscode from 'vscode';
import type { Bundle } from '../../core/model/bundle';
import { countBySeverity, type SeverityCounts } from '../../core/report/summary';
import type { IndexedRoot, IndexSnapshot, WorkspaceIndex } from '../services/workspaceIndex';

/** URIs of this scheme identify tree items for their decorations; they never refer to files. */
const SCHEME = 'edu-i18n';

function itemUri(...parts: string[]): vscode.Uri {
  return vscode.Uri.from({ scheme: SCHEME, path: `/${encodeURIComponent(JSON.stringify(parts))}` });
}

export function rootUri(root: IndexedRoot): vscode.Uri {
  return itemUri(root.folder.uri.toString(), root.analysis.area.id, root.analysis.root);
}

export function bundleUri(root: IndexedRoot, bundle: Bundle): vscode.Uri {
  return itemUri(root.folder.uri.toString(), bundle.id);
}

/** Colors area roots and bundles with errors or warnings and shows how many there are. */
export class IssueDecorations implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<undefined>();
  readonly onDidChangeFileDecorations = this.changed.event;
  private readonly subscription: vscode.Disposable;
  private counts = new Map<string, SeverityCounts>();

  constructor(index: WorkspaceIndex) {
    this.subscription = index.onDidChange((snapshot) => this.update(snapshot));
    const current = index.current();
    if (current) {
      this.update(current);
    }
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const counts = uri.scheme === SCHEME ? this.counts.get(uri.toString()) : undefined;
    if (counts && counts.error > 0) {
      return new vscode.FileDecoration(
        badge(counts.error),
        vscode.l10n.t('Errors: {0}', counts.error),
        new vscode.ThemeColor('list.errorForeground'),
      );
    }
    if (counts && counts.warning > 0) {
      return new vscode.FileDecoration(
        badge(counts.warning),
        vscode.l10n.t('Warnings: {0}', counts.warning),
        new vscode.ThemeColor('list.warningForeground'),
      );
    }
    return undefined;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }

  private update(snapshot: IndexSnapshot): void {
    const counts = new Map<string, SeverityCounts>();
    for (const root of snapshot.roots) {
      counts.set(rootUri(root).toString(), countBySeverity(root.analysis.issues));
      for (const bundle of root.analysis.bundles) {
        const issues = root.analysis.issues.filter((issue) => issue.bundleId === bundle.id);
        counts.set(bundleUri(root, bundle).toString(), countBySeverity(issues));
      }
    }
    this.counts = counts;
    this.changed.fire(undefined);
  }
}

/** Decoration badges hold at most two characters. */
function badge(count: number): string {
  return count > 9 ? '9+' : String(count);
}
