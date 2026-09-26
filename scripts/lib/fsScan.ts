import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'target',
  'build',
  '.vscode-test',
  'coverage',
]);

/**
 * Paths of all files below `root`, relative to it and `/`-separated, sorted. Excluded directories and
 * symbolic links are not followed.
 */
export function listFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
        walk(join(directory, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.isFile()) {
        files.push(`${prefix}${entry.name}`);
      }
    }
  };
  walk(root, '');
  return files.sort();
}
