import { defineConfig } from '@vscode/test-cli';
import { cpSync, rmSync, writeFileSync } from 'node:fs';

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

/**
 * A workspace of four folders (audit T-05): two copies of the fixture; a folder inside the first that holds its
 * translation folder, which then belongs to the innermost folder only; and the translation folder of a third copy
 * itself, as many open it.
 */
function multiRootWorkspace() {
  const folder = 'out/test-workspace/multi';
  rmSync(folder, { recursive: true, force: true });
  for (const name of ['first', 'second', 'third']) {
    cpSync('test/fixtures/workspace-basic', `${folder}/${name}`, { recursive: true });
  }
  const folders = [
    { path: 'first', name: 'first' },
    { path: 'second', name: 'second' },
    { path: 'first/Frontend', name: 'nested' },
    { path: 'third/Frontend/src/assets/i18n', name: 'data' },
  ];
  writeFileSync(`${folder}/multi.code-workspace`, JSON.stringify({ folders }, null, 2));
  return `${folder}/multi.code-workspace`;
}

const base = {
  files: 'out/test/integration/**/*.test.js',
  mocha: { ui: 'tdd', timeout: 20000 },
};

// "min" guards the declared engine (^1.90.0); "stable" catches regressions in current VS Code.
// "perf" measures with a copy of real translation files in out/perf-workspace (Task 2.17), only on request:
// node scripts/perf-workspace.mjs <edu-sharing checkout>, then npm run test:perf (which sets EDU_I18N_PERF).
export default defineConfig([
  { label: 'stable', version: 'stable', workspaceFolder: freshWorkspace('stable'), ...base },
  { label: 'min', version: '1.90.0', workspaceFolder: freshWorkspace('min'), ...base },
  // The other suites expect a single folder; the multi-root suite skips itself in the profiles above.
  {
    label: 'multi',
    version: 'stable',
    workspaceFolder: multiRootWorkspace(),
    ...base,
    files: 'out/test/integration/multiRoot.test.js',
  },
  ...(process.env.EDU_I18N_PERF
    ? [
        {
          label: 'perf',
          version: 'stable',
          workspaceFolder: 'out/perf-workspace',
          ...base,
          mocha: { ...base.mocha, grep: 'performance with real files' },
        },
      ]
    : []),
]);
