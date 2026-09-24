import * as vscode from 'vscode';
import type { Bundle } from '../../core/model/bundle';
import {
  countBySeverity,
  summarizeBundle,
  type BundleSummary,
  type SeverityCounts,
} from '../../core/report/summary';
import type { IndexedRoot, IndexSnapshot, WorkspaceIndex } from '../services/workspaceIndex';
import { bundleUri, IssueDecorations, rootUri } from './decorations';
import { escapeMarkdown } from './viewText';

export type AreaNode =
  | { kind: 'root'; root: IndexedRoot }
  | { kind: 'bundle'; root: IndexedRoot; bundle: Bundle }
  | { kind: 'problems'; messages: readonly string[] }
  | { kind: 'problem'; message: string };

/** The area roots of the last index run with their bundles, and the problems of the run itself. */
export class AreasTreeProvider implements vscode.TreeDataProvider<AreaNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly subscription: vscode.Disposable;
  private readonly numbers = new Intl.NumberFormat(vscode.env.language);

  constructor(private readonly index: WorkspaceIndex) {
    this.subscription = index.onDidChange(() => this.changed.fire(undefined));
  }

  getChildren(node?: AreaNode): AreaNode[] {
    const snapshot = this.index.current();
    if (!snapshot) {
      return [];
    }
    if (!node) {
      const problems: AreaNode[] =
        snapshot.errors.length > 0 ? [{ kind: 'problems', messages: snapshot.errors }] : [];
      return [...problems, ...snapshot.roots.map((root): AreaNode => ({ kind: 'root', root }))];
    }
    if (node.kind === 'root') {
      return node.root.analysis.bundles.map((bundle): AreaNode => ({
        kind: 'bundle',
        root: node.root,
        bundle,
      }));
    }
    if (node.kind === 'problems') {
      return node.messages.map((message): AreaNode => ({ kind: 'problem', message }));
    }
    return [];
  }

  getTreeItem(node: AreaNode): vscode.TreeItem {
    switch (node.kind) {
      case 'root':
        return this.rootItem(node.root);
      case 'bundle':
        return this.bundleItem(node.root, node.bundle);
      case 'problems':
        return this.problemsItem(node.messages);
      case 'problem':
        return this.problemItem(node.message);
    }
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }

  private rootItem(root: IndexedRoot): vscode.TreeItem {
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const location = `${multiRoot ? `${root.folder.name}/` : ''}${root.analysis.root}` || '.';
    const counts = countBySeverity(root.analysis.issues);
    const item = new vscode.TreeItem(root.analysis.area.label, vscode.TreeItemCollapsibleState.Expanded);
    item.id = rootUri(root).toString();
    item.resourceUri = rootUri(root);
    item.description = [location, ...this.countParts(counts)].join(' · ');
    item.tooltip = `${root.analysis.area.label} · ${location}`;
    // Without it, screen readers read the tooltip, which has no counts.
    item.accessibilityInformation = {
      label: vscode.l10n.t('{area} · {root}: errors {errors}, warnings {warnings}, infos {infos}', {
        area: root.analysis.area.label,
        root: location,
        errors: this.numbers.format(counts.error),
        warnings: this.numbers.format(counts.warning),
        infos: this.numbers.format(counts.info),
      }),
    };
    item.iconPath = new vscode.ThemeIcon('globe');
    item.contextValue = 'eduI18n.root';
    return item;
  }

  private bundleItem(root: IndexedRoot, bundle: Bundle): vscode.TreeItem {
    const summary = summarizeBundle(bundle, root.analysis.issues);
    const { error, warning, info } = summary.counts;
    const item = new vscode.TreeItem(bundle.name, vscode.TreeItemCollapsibleState.None);
    item.id = bundleUri(root, bundle).toString();
    item.resourceUri = bundleUri(root, bundle);
    item.description = [this.numbers.format(summary.keys), ...this.countParts(summary.counts)].join(' · ');
    item.accessibilityInformation = {
      label: vscode.l10n.t('{name}: keys {keys}, errors {errors}, warnings {warnings}, infos {infos}', {
        name: bundle.name,
        keys: this.numbers.format(summary.keys),
        errors: this.numbers.format(error),
        warnings: this.numbers.format(warning),
        infos: this.numbers.format(info),
      }),
    };
    item.tooltip = this.bundleTooltip(bundle, summary);
    item.iconPath = new vscode.ThemeIcon('files');
    item.contextValue = 'eduI18n.bundle';
    return item;
  }

  private problemsItem(messages: readonly string[]): vscode.TreeItem {
    const item = new vscode.TreeItem(
      vscode.l10n.t('Problems while indexing'),
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.id = 'eduI18n.problems';
    item.description = this.numbers.format(messages.length);
    item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
    return item;
  }

  private problemItem(message: string): vscode.TreeItem {
    const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
    item.tooltip = message;
    return item;
  }

  /** "✖ 2 · ⚠ 10" without zero counts; the colors and badges come from {@link IssueDecorations}. */
  private countParts({ error, warning }: SeverityCounts): string[] {
    return [
      ...(error > 0 ? [`✖ ${this.numbers.format(error)}`] : []),
      ...(warning > 0 ? [`⚠ ${this.numbers.format(warning)}`] : []),
    ];
  }

  private bundleTooltip(bundle: Bundle, summary: BundleSummary): vscode.MarkdownString {
    const format = (value: number | undefined) => (value === undefined ? '–' : this.numbers.format(value));
    const rows = summary.locales.map(({ locale, keys, counts }) => {
      const name = locale === bundle.reference ? `${locale} (${vscode.l10n.t('reference')})` : locale;
      const cells = [
        escapeMarkdown(name),
        format(keys),
        format(counts.error),
        format(counts.warning),
        format(counts.info),
      ];
      return `| ${cells.join(' | ')} |`;
    });
    const header = [
      vscode.l10n.t('Language'),
      vscode.l10n.t('Keys'),
      vscode.l10n.t('Errors'),
      vscode.l10n.t('Warnings'),
      vscode.l10n.t('Infos'),
    ];
    return new vscode.MarkdownString(
      [
        `**${escapeMarkdown(bundle.name)}**`,
        '',
        `| ${header.join(' | ')} |`,
        '|---|--:|--:|--:|--:|',
        ...rows,
      ].join('\n'),
    );
  }
}

export interface AreasView {
  provider: AreasTreeProvider;
  view: vscode.TreeView<AreaNode>;
  decorations: IssueDecorations;
  disposable: vscode.Disposable;
}

/** The sidebar: tree, error badge, decorations and the context key for its welcome texts. */
export function createAreasView(index: WorkspaceIndex): AreasView {
  const provider = new AreasTreeProvider(index);
  const decorations = new IssueDecorations(index);
  const view = vscode.window.createTreeView('eduI18n.areas', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  const update = (snapshot: IndexSnapshot) => {
    const errors = snapshot.roots.reduce((sum, root) => sum + countBySeverity(root.analysis.issues).error, 0);
    view.badge = errors > 0 ? { value: errors, tooltip: vscode.l10n.t('Errors: {0}', errors) } : undefined;
    // Until the first run has finished, the welcome text says that the search is still going on.
    void vscode.commands.executeCommand('setContext', 'eduI18n.indexed', true);
  };
  return {
    provider,
    view,
    decorations,
    disposable: vscode.Disposable.from(
      provider,
      decorations,
      view,
      vscode.window.registerFileDecorationProvider(decorations),
      index.onDidChange(update),
      vscode.commands.registerCommand('eduI18n.revealInExplorer', (node?: AreaNode) =>
        revealInExplorer(node),
      ),
    ),
  };
}

/** Selects the reference file of a bundle (or its first file) in the Explorer. */
function revealInExplorer(node: AreaNode | undefined): Thenable<unknown> | undefined {
  if (node?.kind !== 'bundle') {
    return undefined;
  }
  const locale = node.bundle.reference ?? node.bundle.locales[0];
  const file = locale !== undefined ? node.bundle.file(locale) : undefined;
  return (
    file &&
    vscode.commands.executeCommand(
      'revealInExplorer',
      vscode.Uri.joinPath(node.root.folder.uri, file.relPath),
    )
  );
}
