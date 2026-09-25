import * as assert from 'node:assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'janschachtschabel.edu-sharing-i18n';

suite('activation', () => {
  test('activates and registers its commands', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} is not installed in the test host`);

    await extension.activate();

    // Every command of the manifest, so that a declared but unregistered command cannot slip through.
    const declared = (extension.packageJSON as { contributes: { commands: { command: string }[] } })
      .contributes.commands;
    const registered = new Set(await vscode.commands.getCommands(true));
    assert.ok(declared.length >= 5, 'the manifest declares the commands');
    assert.deepStrictEqual(
      declared.map(({ command }) => command).filter((command) => !registered.has(command)),
      [],
    );
  });
});
