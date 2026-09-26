// Runs the "perf" profile of the integration tests (Task 2.17), which .vscode-test.mjs defines only on request,
// with the copy of real translation files that scripts/perf-workspace.mjs makes. `npm run test:perf` builds first
// and then calls this; setting the variable here works in every shell.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('out/perf-workspace')) {
  console.error('No out/perf-workspace: run node scripts/perf-workspace.mjs <edu-sharing checkout> first.');
  process.exit(1);
}
const result = spawnSync('npx', ['vscode-test', '--label', 'perf'], {
  stdio: 'inherit',
  // npx is a .cmd file on Windows.
  shell: true,
  env: { ...process.env, EDU_I18N_PERF: '1' },
});
process.exit(result.status ?? 1);
