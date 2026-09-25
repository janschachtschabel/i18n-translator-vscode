import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { keyFromSegments } from '../../src/core/model/keys';
import { rootRef, type IndexSnapshot } from '../../src/extension/services/workspaceIndex';
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

  test('indexes the root of a write once: the watcher then finds its files as indexed', async () => {
    const { index, fileStore } = await activateExtension();
    const root = (await index.refresh()).roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    let runs = 0;
    const listener = index.onDidChange(() => runs++);
    try {
      const result = await fileStore.write(rootRef(root), () => ({
        ok: true,
        changes: [
          {
            kind: 'edit',
            relPath: common.file('fr')!.relPath,
            ops: [{ kind: 'set', key: keyFromSegments(['OK']), value: 'D’accord' }],
          },
        ],
      }));
      assert.ok(result.ok);
      // Well past the watcher's delay of 300 ms after the change.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.strictEqual(runs, 1);
    } finally {
      listener.dispose();
      assert.equal((await fileStore.undo())?.ok, true);
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
});
