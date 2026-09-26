// Copies the Angular translation files of an edu-sharing checkout into out/perf-workspace, the workspace of the
// "perf" profile of the integration tests (Task 2.17). It only reads the checkout; out/ is not committed.
// Usage: node scripts/perf-workspace.mjs <edu-sharing checkout>
//        npm run test:perf
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [checkout] = process.argv.slice(2);
if (!checkout) {
  console.error('Usage: node scripts/perf-workspace.mjs <edu-sharing checkout>');
  process.exit(1);
}
const source = join(checkout, 'Frontend', 'src', 'assets', 'i18n');
if (!existsSync(source)) {
  console.error(`No Angular translation files at ${source}.`);
  process.exit(1);
}
const workspace = join('out', 'perf-workspace');
rmSync(workspace, { recursive: true, force: true });
cpSync(source, join(workspace, 'Frontend', 'src', 'assets', 'i18n'), { recursive: true });
const files = readdirSync(workspace, { recursive: true }).filter((path) => String(path).endsWith('.json'));
console.log(`Copied ${files.length} JSON files to ${workspace}. Measure with: npm run test:perf`);
