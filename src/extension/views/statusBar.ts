import * as vscode from 'vscode';
import { countBySeverity } from '../../core/report/summary';
import type { IndexSnapshot, WorkspaceIndex } from '../services/workspaceIndex';

/** Errors and warnings of all areas at a glance; a click opens the sidebar. */
export class IndexStatusBar implements vscode.Disposable {
  readonly item = vscode.window.createStatusBarItem('eduI18n.status', vscode.StatusBarAlignment.Left, 10);
  private readonly subscription: vscode.Disposable;
  private readonly numbers = new Intl.NumberFormat(vscode.env.language);
  private readonly compact = new Intl.NumberFormat(vscode.env.language, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  constructor(index: WorkspaceIndex) {
    this.item.name = 'edu-sharing i18n';
    this.item.command = 'eduI18n.areas.focus';
    this.subscription = index.onDidChange((snapshot) => this.update(snapshot));
    const current = index.current();
    if (current) {
      this.update(current);
    }
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }

  private update(snapshot: IndexSnapshot): void {
    if (snapshot.roots.length === 0 && snapshot.errors.length === 0) {
      this.item.hide();
      return;
    }
    const { error, warning, info } = countBySeverity(snapshot.roots.flatMap((root) => root.analysis.issues));
    this.item.text = `$(globe) i18n  $(error) ${this.compact.format(error)}  $(warning) ${this.compact.format(warning)}`;
    this.item.accessibilityInformation = {
      label: vscode.l10n.t('Translations: errors {errors}, warnings {warnings}, infos {infos}', {
        errors: this.numbers.format(error),
        warnings: this.numbers.format(warning),
        infos: this.numbers.format(info),
      }),
    };
    this.item.tooltip = [
      ...snapshot.roots.map((root) => {
        const counts = countBySeverity(root.analysis.issues);
        return vscode.l10n.t('{area} · {root}: errors {errors}, warnings {warnings}, infos {infos}', {
          area: root.analysis.area.label,
          root: root.analysis.root || '.',
          errors: this.numbers.format(counts.error),
          warnings: this.numbers.format(counts.warning),
          infos: this.numbers.format(counts.info),
        });
      }),
      ...(snapshot.errors.length > 0
        ? [vscode.l10n.t('Problems while indexing: {0}', this.numbers.format(snapshot.errors.length))]
        : []),
    ].join('\n');
    this.item.show();
  }
}
