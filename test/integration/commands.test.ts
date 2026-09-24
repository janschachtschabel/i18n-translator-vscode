import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { activateExtension } from './helpers';

suite('commands', () => {
  test('"Check translations" re-indexes and updates the status bar (test/fixtures/README.md)', async () => {
    const { index, statusBar } = await activateExtension();
    let runs = 0;
    const subscription = index.onDidChange(() => runs++);
    try {
      await vscode.commands.executeCommand('eduI18n.check');
    } finally {
      subscription.dispose();
    }

    assert.ok(runs >= 1, 'the check did not run the index');
    assert.strictEqual(statusBar.text, '$(globe) i18n  $(error) 3  $(warning) 15');
    assert.strictEqual(
      statusBar.accessibilityInformation?.label,
      'Translations: errors 3, warnings 15, infos 3',
    );
    assert.strictEqual(statusBar.command, 'eduI18n.areas.focus');
  });
});
