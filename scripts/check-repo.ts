// Usage: npm run check:repo -- <repository path> [--json] [--roundtrip]
// Exit code 1 when a finding has severity "error", so the script can gate a CI pipeline. With --roundtrip, the
// script instead reads and writes back every translation file and exits with 1 if one changes.
import { checkRepository, formatReport, formatRoundTrip, roundTrip } from './lib/checkRepo';

const args = process.argv.slice(2);
const repositoryPath = args.find((arg) => !arg.startsWith('--'));
if (!repositoryPath) {
  console.error('Usage: npm run check:repo -- <repository path> [--json] [--roundtrip]');
  process.exit(2);
}

if (args.includes('--roundtrip')) {
  const result = roundTrip(repositoryPath);
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : formatRoundTrip(result));
  process.exitCode = result.changed.length > 0 ? 1 : 0;
} else {
  const report = checkRepository(repositoryPath);
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exitCode = report.totals.error > 0 ? 1 : 0;
}
