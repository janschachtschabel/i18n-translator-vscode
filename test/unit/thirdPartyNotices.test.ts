import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runtimePackages } from '../../scripts/lib/thirdPartyNotices';

const root = resolve(__dirname, '../..');
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

// esbuild bundles the runtime dependencies into the extension and the webview and drops their license headers;
// their licenses ask for the notice in every copy (audit D-01).
describe('ThirdPartyNotices.txt', () => {
  it('carries the name and license of every package bundled into the extension', () => {
    const notices = normalize(readFileSync(join(root, 'ThirdPartyNotices.txt'), 'utf8'));
    const packages = runtimePackages(root);
    expect(packages.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['@preact/signals', '@preact/signals-core', 'jsonc-parser', 'preact']),
    );
    for (const { name, dir } of packages) {
      const license = readdirSync(dir).find((file) => /^licen[cs]e/i.test(file));
      expect(license, name).toBeDefined();
      expect(notices).toContain(normalize(name));
      expect(notices).toContain(normalize(readFileSync(join(dir, license!), 'utf8')));
    }
  });
});
