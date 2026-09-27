import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import { ROOT_LIMITS } from '../../src/extension/services/rootFiles';
import { rootRef, WorkspaceIndex, type IndexSnapshot } from '../../src/extension/services/workspaceIndex';
import { activateExtension, waitFor, workspaceUri } from './helpers';

function severities(snapshot: IndexSnapshot): number[] {
  const issues = snapshot.roots.flatMap((root) => root.analysis.issues);
  return ['error', 'warning', 'info'].map(
    (severity) => issues.filter((issue) => issue.severity === severity).length,
  );
}

suite('workspace index', () => {
  test('indexes the fixture workspace (test/fixtures/README.md)', async () => {
    const { index } = await activateExtension();
    const snapshot = await index.refresh();

    assert.deepStrictEqual(
      snapshot.roots.map(({ analysis }) => [
        analysis.area.id,
        analysis.root,
        analysis.bundles.map((b) => b.name),
      ]),
      [['edu-sharing.angular', 'Frontend/src/assets/i18n', ['admin', 'broken', 'common', 'editorial']]],
    );
    assert.deepStrictEqual(severities(snapshot), [3, 15, 3]);
    assert.deepStrictEqual(snapshot.errors, []);
  });

  // Waiting for a second full run cost the first edit after activation a whole run (audit P-02).
  test('gives the result of the first run to callers of latest() during it, without a second run', async () => {
    const log = vscode.window.createOutputChannel('edu-sharing i18n (index tests)', { log: true });
    const index = new WorkspaceIndex(log);
    try {
      const first = index.refresh();
      const latest = index.latest();
      assert.strictEqual(await latest, await first);
    } finally {
      index.dispose();
      log.dispose();
    }
  });

  // A run of one root that failed, e.g. past the file limit, let its error escape: the old findings stayed and nothing
  // said so until a full run (audit L-22). A full run names such a root as not checked.
  test('names a root it could not index again, and keeps its last analysis until a run succeeds', async () => {
    const log = vscode.window.createOutputChannel('edu-sharing i18n (index tests)', { log: true });
    const limits = { ...ROOT_LIMITS };
    const index = new WorkspaceIndex(log, limits);
    try {
      const first = await index.refresh();
      const ref = rootRef(first.roots[0]!);
      limits.files = 1;
      const failed = await index.refreshRoot(ref);
      assert.match(failed.errors.join('\n'), /could not be checked: the folder holds more than 1 files/);
      assert.strictEqual(failed.roots[0]!.analysis, first.roots[0]!.analysis);
      limits.files = ROOT_LIMITS.files;
      assert.deepStrictEqual((await index.refreshRoot(ref)).errors, []);
    } finally {
      index.dispose();
      log.dispose();
    }
  });

  test('re-indexes when a translation file is added and removed', async () => {
    const { index } = await activateExtension();
    await index.refresh();
    const spanish = workspaceUri('Frontend/src/assets/i18n/common/es.json');
    const hasSpanish = (snapshot: IndexSnapshot) =>
      snapshot.roots.some((root) => root.analysis.issues.some((issue) => issue.locale === 'es'));
    const spanishDiagnostics = () =>
      vscode.languages
        .getDiagnostics(spanish)
        .filter((diagnostic) => diagnostic.source === 'edu-sharing i18n');

    const added = waitFor(index.onDidChange, hasSpanish);
    await vscode.workspace.fs.writeFile(spanish, new TextEncoder().encode('{}\n'));
    try {
      const snapshot = await added;
      const missing = snapshot.roots[0]!.analysis.issues.filter(
        (issue) => issue.locale === 'es' && issue.rule === 'missing-key',
      );
      assert.strictEqual(missing.length, 12);
      assert.deepStrictEqual(
        spanishDiagnostics().map((diagnostic) => diagnostic.message),
        ['12 keys are missing in es.'],
      );
    } finally {
      const removed = waitFor(index.onDidChange, (snapshot) => !hasSpanish(snapshot));
      await vscode.workspace.fs.delete(spanish);
      await removed;
    }
    // The file has no problems any more, so its diagnostics must be gone.
    assert.deepStrictEqual(spanishDiagnostics(), []);
  });

  test('indexes a custom area whose id is also the name of an object method', async () => {
    const { index } = await activateExtension();
    await index.refresh();
    const config = vscode.workspace.getConfiguration('eduI18n');
    const area = {
      id: 'constructor',
      format: 'json-nested',
      files: '{bundle}/{locale}.json',
      localePattern: '[a-z]{2}',
      roots: ['nowhere'],
    };

    const indexed = waitFor(index.onDidChange, (snapshot) =>
      snapshot.roots.some((root) => root.analysis.area.id === 'constructor'),
    );
    await config.update('areas', [area], vscode.ConfigurationTarget.Global);
    try {
      const snapshot = await indexed;
      assert.deepStrictEqual(snapshot.errors, []);
      assert.deepStrictEqual(
        snapshot.roots.map(({ analysis }) => [analysis.area.id, analysis.root]),
        [
          ['edu-sharing.angular', 'Frontend/src/assets/i18n'],
          ['constructor', 'nowhere'],
        ],
      );
    } finally {
      const restored = waitFor(index.onDidChange, (snapshot) => snapshot.roots.length === 1);
      await config.update('areas', undefined, vscode.ConfigurationTarget.Global);
      await restored;
    }
  });

  test('indexes a root again without a new analysis while its files are as indexed', async () => {
    const { index } = await activateExtension();
    const snapshot = await index.refresh();
    let runs = 0;
    const listener = index.onDidChange(() => runs++);
    try {
      assert.strictEqual(await index.refreshRoot(rootRef(snapshot.roots[0]!)), snapshot);
      assert.strictEqual(runs, 0);
    } finally {
      listener.dispose();
    }
  });

  for (const locale of ['fr', 'de']) {
    // de.json of common is also the marker of the area's roots: its texts must not set off a search for roots.
    test(`indexes the root of a write to ${locale}.json once: the watcher then finds its files as indexed`, async () => {
      const { index, fileStore } = await activateExtension();
      const root = (await index.refresh()).roots[0]!;
      const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
      const file = vscode.Uri.joinPath(root.folder.uri, common.file(locale)!.relPath);
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.joinPath(file, '..'), `${locale}.json`),
      );
      const seen = waitFor(watcher.onDidChange, () => true).catch(() => undefined);
      let runs = 0;
      const listener = index.onDidChange(() => runs++);
      try {
        const result = await fileStore.write(rootRef(root), () => ({
          ok: true,
          changes: [
            {
              kind: 'edit',
              relPath: common.file(locale)!.relPath,
              ops: [{ kind: 'set', key: keyFromSegments(['OK']), value: 'D’accord' }],
            },
          ],
        }));
        assert.ok(result.ok);
        await fileStore.indexed();
        // Once the watcher has seen the write, past its delay of 300 ms.
        await seen;
        await new Promise((resolve) => setTimeout(resolve, 800));
        assert.strictEqual(runs, 1);
      } finally {
        listener.dispose();
        watcher.dispose();
        assert.equal((await fileStore.undo())?.ok, true);
      }
    });
  }

  // After a write, the watcher's run listed and read the whole root again only to find its files as indexed, and a save
  // in the meantime waited for it (audit P-06). The watcher now compares the files it reported first. A run of the root
  // fails here and says so: its listing finds more than one file.
  test('runs the root after a reported file only if it differs from what was indexed, or the root had errors', async () => {
    const log = vscode.window.createOutputChannel('edu-sharing i18n (index tests)', { log: true });
    const limits = { ...ROOT_LIMITS };
    const index = new WorkspaceIndex(log, limits);
    const root = (await index.refresh()).roots[0]!;
    const file = vscode.Uri.joinPath(
      root.folder.uri,
      root.analysis.bundles.find((bundle) => bundle.name === 'common')!.file('fr')!.relPath,
    );
    const bytes = await vscode.workspace.fs.readFile(file);
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(file, '..'), 'fr.json'),
    );
    const failedRuns: boolean[] = [];
    const listener = index.onDidChange((snapshot) =>
      failedRuns.push(snapshot.errors.some((error) => /could not be checked/.test(error))),
    );
    /** Writes the file and waits until the watcher has seen it and the delay of the index (300 ms) has passed. */
    const write = async (written: Uint8Array) => {
      const seen = waitFor(watcher.onDidChange, () => true).catch(() => undefined);
      await vscode.workspace.fs.writeFile(file, written);
      await seen;
      await new Promise((resolve) => setTimeout(resolve, 800));
    };
    limits.files = 1;
    try {
      await write(bytes);
      assert.deepStrictEqual(failedRuns, [], 'the same bytes: no run');
      await write(new Uint8Array([...bytes, 0x0a]));
      assert.deepStrictEqual(failedRuns, [true], 'other bytes: a run, which fails');
      // The bytes the index read, but its last run of the root failed: a run again.
      await write(bytes);
      assert.deepStrictEqual(failedRuns, [true, true], 'the root had errors: a run');
    } finally {
      listener.dispose();
      watcher.dispose();
      index.dispose();
      log.dispose();
      await vscode.workspace.fs.writeFile(file, bytes);
    }
  });

  test('re-indexes when a setting changes', async () => {
    const { index } = await activateExtension();
    await index.refresh();
    // User settings of the test instance, so the fixture workspace gets no .vscode folder.
    const config = vscode.workspace.getConfiguration('eduI18n');

    const quiet = waitFor(index.onDidChange, (snapshot) => severities(snapshot)[2] === 0);
    await config.update('checks.severity', { 'same-as-reference': 'off' }, vscode.ConfigurationTarget.Global);
    try {
      await quiet;
    } finally {
      const restored = waitFor(index.onDidChange, (snapshot) => severities(snapshot)[2] === 3);
      await config.update('checks.severity', undefined, vscode.ConfigurationTarget.Global);
      await restored;
    }
  });

  // Every change of an AI setting read the whole workspace anew (2 s on the old app's data folder).
  test('does not re-index when an AI setting changes, which no run reads', async () => {
    const { index } = await activateExtension();
    await index.refresh();
    const config = vscode.workspace.getConfiguration('eduI18n');
    let runs = 0;
    const subscription = index.onDidChange(() => runs++);
    try {
      await config.update('ai.timeoutSeconds', 60, vscode.ConfigurationTarget.Global);
      // Longer than the index waits before a run.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.strictEqual(runs, 0);
    } finally {
      subscription.dispose();
      await config.update('ai.timeoutSeconds', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  test('reports an invalid backup setting at once, and no longer once it is valid', async () => {
    const { index } = await activateExtension();
    await index.refresh();
    const config = vscode.workspace.getConfiguration('eduI18n');
    const reported = (snapshot: IndexSnapshot) =>
      snapshot.errors.some((error) => error.includes('backup.keep'));
    try {
      const invalid = waitFor(index.onDidChange, reported);
      await config.update('backup.keep', 0, vscode.ConfigurationTarget.Global);
      await invalid;
      const valid = waitFor(index.onDidChange, (snapshot) => !reported(snapshot));
      await config.update('backup.keep', undefined, vscode.ConfigurationTarget.Global);
      await valid;
    } finally {
      await config.update('backup.keep', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
