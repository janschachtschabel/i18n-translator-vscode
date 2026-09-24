import type * as vscode from 'vscode';

/** Tree of translation areas and bundles. Empty until the workspace index exists (phase 1). */
export class AreasTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    return [];
  }
}
