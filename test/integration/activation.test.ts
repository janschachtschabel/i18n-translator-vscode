import * as assert from 'node:assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'janschachtschabel.edu-sharing-i18n';

suite('activation', () => {
  test('activates and registers its commands', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} is not installed in the test host`);

    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('eduI18n.check'), 'eduI18n.check is not registered');
    assert.ok(commands.includes('eduI18n.configureRoots'), 'eduI18n.configureRoots is not registered');
  });
});
