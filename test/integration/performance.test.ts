import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { diffModels } from '../../src/shared/patch';
import { buildBundleViewModel } from '../../src/shared/viewModel';
import { formatMessage } from '../../src/core/checks/messages';
import { activateExtension, nextPost } from './helpers';

/** The median of `runs` timings of `work`, in milliseconds. */
async function median(runs: number, work: () => unknown): Promise<number> {
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    await work();
    times.push(performance.now() - started);
  }
  return Math.round(times.sort((a, b) => a - b)[Math.floor(runs / 2)]!);
}

/**
 * Measures the editor with the translation files of the real repository (design §8, Task 2.17): a copy below
 * out/perf-workspace, which only the "perf" profile of .vscode-test.mjs opens. Elsewhere the suite is skipped.
 */
suite('performance with real files', function () {
  this.timeout(120000);

  suiteSetup(function () {
    if (!vscode.workspace.workspaceFolders?.[0]?.uri.path.includes('perf-workspace')) {
      this.skip();
    }
  });
  teardown(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  test('indexes, opens common and saves a cell', async () => {
    const { index, editors, fileStore } = await activateExtension();
    const full = await median(3, () => index.refresh());
    const root = index.current()!.roots[0]!;
    const common = root.analysis.bundles.find((bundle) => bundle.name === 'common')!;
    const skipped = await median(3, () =>
      index.refreshRoot({ folder: root.folder.uri, areaId: root.analysis.area.id, root: root.analysis.root }),
    );
    const options = {
      issues: root.analysis.issues,
      variants: Object.keys(root.settings.variants),
      baseFileLanguage: root.settings.baseFileLanguage,
      localize: (message: { template: string; args: Record<string, unknown> }) =>
        formatMessage(message.template, message.args as never),
    };
    const model = buildBundleViewModel(common, options);
    const build = await median(5, () => buildBundleViewModel(common, options));
    const changed = {
      ...model,
      rows: model.rows.map((row, i) => (i === 0 ? { ...row, key: `${row.key} ` } : row)),
    };
    const diff = await median(5, () => diffModels(model, changed));

    const opened = performance.now();
    const editor = editors.open(root, common);
    await nextPost(editor, 'bundle');
    const open = Math.round(performance.now() - opened);

    const target = model.rows.find((row) => row.cells['fr']?.value)!;
    const before = target.cells['fr']!.value!;
    /** Saves the text of the cell as the editor does; how long until the answer and until the patch. */
    const save = async (requestId: string, from: string, value: string) => {
      const saved = performance.now();
      const answer = nextPost(editor, 'writeResult');
      const patched = nextPost(editor, 'patch');
      await editor.receive({
        type: 'edit',
        requestId,
        entryId: target.entryId,
        locale: 'fr',
        value,
        before: from,
      });
      assert.strictEqual((await answer).ok, true);
      const answered = Math.round(performance.now() - saved);
      await patched;
      return { answered, patched: Math.round(performance.now() - saved) };
    };
    // The first write of a session backs up the files first; the second shows the cost of a save alone.
    const first = await save('p1', before, `${before} (1)`);
    const second = await save('p2', `${before} (1)`, `${before} (2)`);
    assert.equal((await fileStore.undo())?.ok, true);
    assert.equal((await fileStore.undo())?.ok, true);

    console.log(
      JSON.stringify(
        {
          files: root.analysis.bundles.reduce((sum, bundle) => sum + bundle.locales.length, 0),
          commonKeys: model.rows.length,
          commonLanguages: model.locales.length,
          fullIndexMs: full,
          unchangedRootMs: skipped,
          buildModelMs: build,
          diffModelsMs: diff,
          openEditorUntilModelMs: open,
          firstSave: first,
          secondSave: second,
        },
        null,
        2,
      ),
    );
    // The goals of design §8, after the numbers are printed: a regression by several times fails the run.
    assert.ok(full < 1500, `full index ${full} ms`);
    assert.ok(open < 1000, `editor open ${open} ms`);
    assert.ok(second.answered < 150, `save ${second.answered} ms`);
  });
});
