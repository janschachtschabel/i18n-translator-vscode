import { defineConfig } from '@vscode/test-cli';

const base = {
  files: 'out/test/integration/**/*.test.js',
  workspaceFolder: 'test/fixtures/workspace-basic',
  mocha: { ui: 'tdd', timeout: 20000 },
};

// "min" guards the declared engine (^1.90.0); "stable" catches regressions in current VS Code.
export default defineConfig([
  { label: 'stable', version: 'stable', ...base },
  { label: 'min', version: '1.90.0', ...base },
]);
