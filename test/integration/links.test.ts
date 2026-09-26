import * as assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionApi } from '../../src/extension/extension';
import { rootRef } from '../../src/extension/services/workspaceIndex';
import { activateExtension, workspaceUri } from './helpers';

const I18N = 'Frontend/src/assets/i18n';

// A link in a repository can lead out of the workspace folder, where the checks of paths do not reach (audit S-05).
suite('symbolic links', () => {
  let api: ExtensionApi;
  let outside: string;
  let link: string;

  suiteSetup(async () => {
    api = await activateExtension();
  });

  // A bundle folder that is a link to a folder outside; "junction" needs no rights on Windows, Linux ignores it.
  setup(() => {
    outside = mkdtempSync(join(tmpdir(), 'edu-i18n-outside-'));
    writeFileSync(join(outside, 'de.json'), '{\n  "A": "a"\n}\n');
    writeFileSync(join(outside, 'fr.json'), '{\n  "A": "a"\n}\n');
    link = workspaceUri(`${I18N}/linked`).fsPath;
    symlinkSync(outside, link, 'junction');
  });

  teardown(async () => {
    try {
      unlinkSync(link);
    } catch {
      rmdirSync(link);
    }
    rmSync(outside, { recursive: true, force: true });
    await api.index.refresh();
  });

  test('reads no file through a link, and says so', async () => {
    const snapshot = await api.index.refresh();
    assert.ok(!snapshot.roots[0]!.analysis.bundles.some((bundle) => bundle.name === 'linked'));
    assert.ok(
      snapshot.errors.some((error) => /linked\/de\.json.*symbolic link/.test(error)),
      JSON.stringify(snapshot.errors),
    );
  });

  test('writes no file through a link', async () => {
    const snapshot = await api.index.refresh();
    const result = await api.fileStore.write(rootRef(snapshot.roots[0]!), () => ({
      ok: true,
      changes: [{ kind: 'create', relPath: `${I18N}/linked/es.json`, content: '{}\n' }],
    }));
    assert.ok(
      !result.ok && result.reason === 'error' && /symbolic link/.test(result.message),
      JSON.stringify(result),
    );
    assert.equal(existsSync(join(outside, 'es.json')), false);
  });
});
