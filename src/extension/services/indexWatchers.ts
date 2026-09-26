import * as vscode from 'vscode';

/** A pattern the index follows, and what a change of a matching file sets off. */
export interface WatchedPattern {
  pattern: vscode.RelativePattern;
  onChange: () => void;
  /**
   * Whether a change of a file's content counts, or only files that come and go: a marker file (e.g.
   * `common/de.json`) tells where a root is, which its texts do not change.
   */
  contents: boolean;
}

/** The file watchers of the index: exactly one per pattern of the last full run. */
export class IndexWatchers implements vscode.Disposable {
  private readonly watchers = new Map<string, vscode.Disposable>();

  /** Keeps the watchers of `patterns`, by key, and disposes of the others. */
  update(patterns: ReadonlyMap<string, WatchedPattern>): void {
    for (const [key, watcher] of this.watchers) {
      if (!patterns.has(key)) {
        watcher.dispose();
        this.watchers.delete(key);
      }
    }
    for (const [key, { pattern, onChange, contents }] of patterns) {
      if (!this.watchers.has(key)) {
        const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, !contents, false);
        this.watchers.set(
          key,
          vscode.Disposable.from(
            watcher,
            watcher.onDidCreate(onChange),
            watcher.onDidChange(onChange),
            watcher.onDidDelete(onChange),
          ),
        );
      }
    }
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
  }
}
