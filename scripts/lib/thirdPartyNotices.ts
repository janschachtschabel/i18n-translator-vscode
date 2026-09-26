import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A package that esbuild bundles into the extension or the webview. */
export interface RuntimePackage {
  name: string;
  dir: string;
  repository: string | undefined;
}

interface Manifest {
  dependencies?: Record<string, string>;
  repository?: string | { url?: string };
}

const readManifest = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

/** The runtime dependencies of the package at `root`, with theirs, sorted by name. */
export function runtimePackages(root: string): RuntimePackage[] {
  const found = new Map<string, RuntimePackage>();
  const visit = (name: string) => {
    if (found.has(name)) {
      return;
    }
    const dir = join(root, 'node_modules', ...name.split('/'));
    if (!existsSync(join(dir, 'package.json'))) {
      throw new Error(`${name} is not installed; run npm ci first.`);
    }
    const manifest = readManifest(dir);
    const repository =
      typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    found.set(name, { name, dir, repository });
    Object.keys(manifest.dependencies ?? {}).forEach(visit);
  };
  Object.keys(readManifest(root).dependencies ?? {}).forEach(visit);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** The notices file: each bundled package with its license text, as the licenses ask for. */
export function renderNotices(packages: readonly RuntimePackage[]): string {
  const rule = '-'.repeat(80);
  const sections = packages.map(({ name, dir, repository }) => {
    const file = readdirSync(dir).find((candidate) => /^licen[cs]e/i.test(candidate));
    if (!file) {
      throw new Error(`${name} has no license file.`);
    }
    const heading = repository ? `${name} (${repository.replace(/^git\+/, '')})` : name;
    return `${rule}\n${heading}\n${rule}\n\n${readFileSync(join(dir, file), 'utf8').replace(/\r\n?/g, '\n').trim()}\n`;
  });
  return [
    'Third-party notices for edu-sharing i18n',
    '',
    'The extension bundles the following packages. Their licenses follow.',
    '',
    ...sections,
  ].join('\n');
}
