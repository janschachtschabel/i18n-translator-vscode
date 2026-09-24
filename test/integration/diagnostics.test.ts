import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { DiagnosticsPublisher } from '../../src/extension/diagnostics/diagnosticsPublisher';
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

  test('publishes each file in its own call, as VS Code drops files beyond 1,100 diagnostics per call', async () => {
    const { index } = await activateExtension();
    const real = vscode.languages.createDiagnosticCollection('eduI18n.test');
    const calls: string[] = [];
    const recording: vscode.DiagnosticCollection = {
      name: real.name,
      set: ((
        first: vscode.Uri | readonly [vscode.Uri, readonly vscode.Diagnostic[] | undefined][],
        diagnostics?: readonly vscode.Diagnostic[],
      ) => {
        calls.push(first instanceof vscode.Uri ? 'one file' : `${first.length} files`);
        if (first instanceof vscode.Uri) {
          real.set(first, diagnostics);
        } else {
          real.set(first);
        }
      }) as vscode.DiagnosticCollection['set'],
      delete: (uri) => real.delete(uri),
      clear: () => real.clear(),
      forEach: (callback, thisArg) => real.forEach(callback, thisArg),
      get: (uri) => real.get(uri),
      has: (uri) => real.has(uri),
      dispose: () => real.dispose(),
      [Symbol.iterator]: () => real[Symbol.iterator](),
    };
    const publisher = new DiagnosticsPublisher(index, recording);
    try {
      await index.refresh();
      assert.ok(calls.length > 0, 'nothing was published');
      assert.deepStrictEqual(new Set(calls), new Set(['one file']));
      let published = 0;
      recording.forEach((_uri, diagnostics) => (published += diagnostics.length));
      assert.strictEqual(published, 17);
    } finally {
      publisher.dispose();
    }
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
