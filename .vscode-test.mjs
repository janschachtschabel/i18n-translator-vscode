import { defineConfig } from '@vscode/test-cli';
import { cpSync, rmSync } from 'node:fs';

/**
 * The tests write translation files (file store, added languages), so each profile gets a fresh copy of the
 * fixture workspace below out/: test/fixtures stays untouched even when a run breaks off.
 */
function freshWorkspace(label) {
  const folder = `out/test-workspace/${label}`;
  rmSync(folder, { recursive: true, force: true });
  cpSync('test/fixtures/workspace-basic', folder, { recursive: true });
  return folder;
}

const base = {
  files: 'out/test/integration/**/*.test.js',
  mocha: { ui: 'tdd', timeout: 20000 },
};

// "min" guards the declared engine (^1.90.0); "stable" catches regressions in current VS Code.
export default defineConfig([
  { label: 'stable', version: 'stable', workspaceFolder: freshWorkspace('stable'), ...base },
  { label: 'min', version: '1.90.0', workspaceFolder: freshWorkspace('min'), ...base },
]);
