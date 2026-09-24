import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { activateExtension, workspaceUri } from './helpers';

const SOURCE = 'edu-sharing i18n';

function ours(diagnostics: readonly vscode.Diagnostic[]): vscode.Diagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.source === SOURCE);
}

suite('diagnostics', () => {
  test('publishes the errors and warnings of the fixture workspace (test/fixtures/README.md)', async () => {
    const { index } = await activateExtension();
    await index.refresh();

    const all = vscode.languages.getDiagnostics().flatMap(([, diagnostics]) => ours(diagnostics));
    assert.strictEqual(all.length, 17);
    assert.ok(all.every((diagnostic) => diagnostic.severity !== vscode.DiagnosticSeverity.Information));

    const french = ours(
      vscode.languages.getDiagnostics(workspaceUri('Frontend/src/assets/i18n/common/fr.json')),
    );
    assert.deepStrictEqual(
      french.map((diagnostic) => [diagnostic.code, diagnostic.range.start.line]),
      [
        ['missing-key', 0],
        ['placeholder-mismatch', 1],
        ['empty-value', 4],
        ['html-mismatch', 7],
      ],
    );
  });

  test('combines the missing keys of a file and links them to the reference', async () => {
    const { index } = await activateExtension();
    await index.refresh();

    const [missing] = ours(
      vscode.languages.getDiagnostics(workspaceUri('Frontend/src/assets/i18n/common/fr.json')),
    );
    assert.strictEqual(missing?.message, '2 keys are missing in fr.');
    assert.deepStrictEqual(
      missing?.relatedInformation?.map((related) => [
        vscode.workspace.asRelativePath(related.location.uri),
        related.location.range.start.line,
        related.message,
      ]),
      [
        ['Frontend/src/assets/i18n/common/de.json', 5, 'CANCEL: Abbrechen'],
        ['Frontend/src/assets/i18n/common/de.json', 18, 'WORKSPACE.FILE.TITLE: Datei'],
      ],
    );
  });
});
