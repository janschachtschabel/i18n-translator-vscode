// Usage: npm run check:repo -- <repository path> [--json]
// Exit code 1 when a finding has severity "error", so the script can gate a CI pipeline.
import { checkRepository, formatReport } from './lib/checkRepo';

const args = process.argv.slice(2);
const repositoryPath = args.find((arg) => !arg.startsWith('--'));
if (!repositoryPath) {
  console.error('Usage: npm run check:repo -- <repository path> [--json]');
  process.exit(2);
}

const report = checkRepository(repositoryPath);
console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
process.exitCode = report.totals.error > 0 ? 1 : 0;
