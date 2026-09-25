import type * as vscode from 'vscode';
import { describe, expect, it } from 'vitest';
import { UndoHistory, type UndoEntry } from '../../../src/extension/services/undoHistory';

/** An entry that keeps `bytes` previous bytes; `name` tells the entries apart. */
const entry = (name: string, bytes: number): UndoEntry => ({
  files: [{ uri: { path: name } as vscode.Uri, before: new Uint8Array(bytes), afterRevision: name }],
});
const names = (history: UndoHistory) => {
  const popped: string[] = [];
  for (let next = history.pop(); next; next = history.pop()) {
    popped.push(next.files[0]!.afterRevision);
  }
  return popped;
};

describe('UndoHistory', () => {
  it('gives back the newest write first', () => {
    const history = new UndoHistory();
    history.push(entry('a', 1));
    history.push(entry('b', 1));
    expect(names(history)).toEqual(['b', 'a']);
  });

  it('drops the oldest writes beyond the number of entries', () => {
    const history = new UndoHistory({ undoEntries: 2, undoBytes: 100 });
    ['a', 'b', 'c'].forEach((name) => history.push(entry(name, 1)));
    expect(names(history)).toEqual(['c', 'b']);
  });

  it('drops the oldest writes beyond the memory limit, but keeps the newest however large', () => {
    const history = new UndoHistory({ undoEntries: 100, undoBytes: 10 });
    history.push(entry('a', 4));
    history.push(entry('b', 4));
    history.push(entry('c', 4));
    expect(names(history)).toEqual(['c', 'b']);
    history.push(entry('d', 50));
    expect(names(history)).toEqual(['d']);
  });

  it('counts new files, which have no previous bytes, as empty', () => {
    const history = new UndoHistory({ undoEntries: 100, undoBytes: 0 });
    history.push({
      files: [{ uri: { path: 'new' } as vscode.Uri, before: undefined, afterRevision: 'new' }],
    });
    history.push({
      files: [{ uri: { path: 'new2' } as vscode.Uri, before: undefined, afterRevision: 'new2' }],
    });
    expect(names(history)).toEqual(['new2', 'new']);
  });
});
