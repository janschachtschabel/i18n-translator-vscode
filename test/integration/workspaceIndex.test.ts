import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { IndexSnapshot } from '../../src/extension/services/workspaceIndex';
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

    const added = waitFor(index.onDidChange, hasSpanish);
    await vscode.workspace.fs.writeFile(spanish, new TextEncoder().encode('{}\n'));
    try {
      const snapshot = await added;
      const missing = snapshot.roots[0]!.analysis.issues.filter(
        (issue) => issue.locale === 'es' && issue.rule === 'missing-key',
      );
      assert.strictEqual(missing.length, 12);
    } finally {
      const removed = waitFor(index.onDidChange, (snapshot) => !hasSpanish(snapshot));
      await vscode.workspace.fs.delete(spanish);
      await removed;
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
