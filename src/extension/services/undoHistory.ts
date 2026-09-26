import type * as vscode from 'vscode';

/** One write that can be undone: the bytes of its files before it, and the revision of the bytes it wrote. */
export interface UndoEntry {
  files: { uri: vscode.Uri; before: Uint8Array | undefined; afterRevision: string }[];
}

/** How many writes a session can undo, and how many previous bytes it may keep for that. */
export interface UndoLimits {
  undoEntries: number;
  undoBytes: number;
}

/** A restore or a batch write keeps the previous bytes of many files; 32 MB bound them in the extension host. */
export const UNDO_LIMITS: UndoLimits = { undoEntries: 100, undoBytes: 32 * 1024 * 1024 };

/** The writes of a session that can be undone, newest last. */
export class UndoHistory {
  private readonly entries: UndoEntry[] = [];

  constructor(private readonly limits: UndoLimits = UNDO_LIMITS) {}

  /** Adds a write and drops the oldest beyond the limits; the newest stays, however large. */
  push(entry: UndoEntry): void {
    this.entries.push(entry);
    let bytes = this.entries.reduce((sum, kept) => sum + size(kept), 0);
    const { undoEntries, undoBytes } = this.limits;
    while (this.entries.length > 1 && (this.entries.length > undoEntries || bytes > undoBytes)) {
      bytes -= size(this.entries.shift()!);
    }
  }

  pop(): UndoEntry | undefined {
    return this.entries.pop();
  }
}

function size(entry: UndoEntry): number {
  return entry.files.reduce((sum, file) => sum + (file.before?.byteLength ?? 0), 0);
}
