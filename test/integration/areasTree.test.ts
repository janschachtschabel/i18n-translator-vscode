import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { activateExtension } from './helpers';

suite('areas view', () => {
  test('shows each area root with its bundles and their counts (test/fixtures/README.md)', async () => {
    const { index, views } = await activateExtension();
    await index.refresh();

    const roots = await views.areas.getChildren();
    const rootItems = await Promise.all(roots.map((node) => views.areas.getTreeItem(node)));
    assert.deepStrictEqual(
      rootItems.map((item) => [item.label, item.description, item.accessibilityInformation?.label]),
      [
        [
          'Angular JSON',
          'Frontend/src/assets/i18n · ✖ 3 · ⚠ 15',
          'Angular JSON · Frontend/src/assets/i18n: errors 3, warnings 15, infos 3',
        ],
      ],
    );

    const bundles = await views.areas.getChildren(roots[0]);
    const items: vscode.TreeItem[] = await Promise.all(bundles.map((node) => views.areas.getTreeItem(node)));
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

  test('colors bundles by their worst finding and counts the errors on the view', async () => {
    const { index, views } = await activateExtension();
    await index.refresh();

    const [root] = await views.areas.getChildren();
    const items = await Promise.all(
      (await views.areas.getChildren(root)).map((node) => views.areas.getTreeItem(node)),
    );
    const decorationOf = (name: string) => {
      const uri = items.find((item) => item.label === name)?.resourceUri;
      const decoration = uri && views.decorations.provideFileDecoration(uri);
      return decoration && [decoration.badge, decoration.color, decoration.tooltip];
    };
    assert.deepStrictEqual(decorationOf('common'), [
      '2',
      new vscode.ThemeColor('list.errorForeground'),
      'Errors: 2',
    ]);
    assert.deepStrictEqual(decorationOf('editorial'), [
      '2',
      new vscode.ThemeColor('list.warningForeground'),
      'Warnings: 2',
    ]);
    assert.deepStrictEqual(views.areasView.badge, { value: 3, tooltip: 'Errors: 3' });
  });
});
