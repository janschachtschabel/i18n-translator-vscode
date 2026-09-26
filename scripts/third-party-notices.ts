// Writes ThirdPartyNotices.txt from the installed runtime dependencies, which esbuild bundles into the VSIX without
// their license headers. Run it after adding or updating a dependency: npm run notices
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderNotices, runtimePackages } from './lib/thirdPartyNotices';

const root = resolve(__dirname, '..');
const packages = runtimePackages(root);
writeFileSync(resolve(root, 'ThirdPartyNotices.txt'), renderNotices(packages));
console.log(`ThirdPartyNotices.txt: ${packages.map(({ name }) => name).join(', ')}`);
