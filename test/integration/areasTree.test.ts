import * as assert from 'node:assert';
import type * as vscode from 'vscode';
import { activateExtension } from './helpers';

suite('areas view', () => {
  test('shows each area root with its bundles and their counts (test/fixtures/README.md)', async () => {
    const { index, areas } = await activateExtension();
    await index.refresh();

    const roots = await areas.getChildren();
    const rootItems = await Promise.all(roots.map((node) => areas.getTreeItem(node)));
    assert.deepStrictEqual(
      rootItems.map((item) => [item.label, item.description]),
      [['Angular JSON', 'Frontend/src/assets/i18n · ✖ 3 · ⚠ 15']],
    );

    const bundles = await areas.getChildren(roots[0]);
    const items: vscode.TreeItem[] = await Promise.all(bundles.map((node) => areas.getTreeItem(node)));
    assert.deepStrictEqual(
      items.map((item) => [item.label, item.description]),
      [
        ['admin', '2 · ⚠ 3'],
        ['broken', '1 · ✖ 1'],
        ['common', '12 · ✖ 2 · ⚠ 10'],
        ['editorial', '1 · ⚠ 2'],
      ],
    );
    assert.strictEqual(
      items[2]?.accessibilityInformation?.label,
      'common: keys 12, errors 2, warnings 10, infos 2',
    );
  });
});
