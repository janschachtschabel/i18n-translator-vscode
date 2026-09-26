import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { ANGULAR_PRESET } from '../../src/core/area/presets';
import { DEFAULT_SETTINGS } from '../../src/core/config/settings';
import { excludeGlob } from '../../src/extension/config';
import { detectRoots, listRoot, readFiles, ROOT_LIMITS } from '../../src/extension/services/rootFiles';

const ROOT = 'Frontend/src/assets/i18n';

// What a repository holds is not the extension's to choose: its size is bounded before it is read (audit S-04).
suite('root files', () => {
  const folder = () => vscode.workspace.workspaceFolders![0]!;
  const exclude = excludeGlob(DEFAULT_SETTINGS.exclude);

  test('detects no more roots than the limit, so that many get set in the settings instead', async () => {
    assert.deepEqual(await detectRoots(folder(), ANGULAR_PRESET, exclude, { ...ROOT_LIMITS, roots: 1 }), [
      ROOT,
    ]);
    await assert.rejects(
      detectRoots(folder(), ANGULAR_PRESET, exclude, { ...ROOT_LIMITS, roots: 0 }),
      /more than 0 roots.*eduI18n\.roots/,
    );
  });

  test('lists no root with more files than the limit', async () => {
    const all = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder(), `${ROOT}/**/*`),
      exclude,
    );
    const limits = { ...ROOT_LIMITS, files: all.length };
    assert.equal((await listRoot(folder(), ANGULAR_PRESET, ROOT, exclude, limits)).length, all.length);
    await assert.rejects(
      listRoot(folder(), ANGULAR_PRESET, ROOT, exclude, { ...limits, files: all.length - 1 }),
      new RegExp(`more than ${all.length - 1} files`),
    );
  });

  test('reads no file larger than the limit, and says so', async () => {
    const reported: string[] = [];
    const paths = [`${ROOT}/common/de.json`, `${ROOT}/admin/de.json`];
    const size = (await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder().uri, paths[0]!))).size;
    const read = await readFiles(folder(), paths, (message) => reported.push(message), {
      ...ROOT_LIMITS,
      fileBytes: size - 1,
    });
    assert.deepEqual(
      read.map((file) => file.relPath),
      [`${ROOT}/admin/de.json`],
    );
    assert.equal(reported.length, 1);
    assert.match(reported[0]!, /common\/de\.json.*larger/);
  });
});
