import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');

function readJson(relPath: string): Record<string, string> {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8')) as Record<string, string>;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Runtime strings must be passed to l10n.t() as a single-quoted literal so they can be collected here. */
function runtimeMessages(): string[] {
  const messages = new Set<string>();
  for (const file of sourceFiles('src/extension')) {
    for (const match of readFileSync(file, 'utf8').matchAll(/l10n\.t\(\s*'((?:\\.|[^'\\])*)'/g)) {
      messages.add(match[1]!.replace(/\\(.)/g, '$1'));
    }
  }
  return [...messages].sort();
}

describe('localization', () => {
  it('translates every runtime message to German', () => {
    const german = readJson('l10n/bundle.l10n.de.json');
    const untranslated = runtimeMessages().filter((message) => !german[message]);
    expect(untranslated).toEqual([]);
  });

  it('has no stale entries in the German runtime bundle', () => {
    const used = new Set(runtimeMessages());
    const stale = Object.keys(readJson('l10n/bundle.l10n.de.json')).filter((key) => !used.has(key));
    expect(stale).toEqual([]);
  });

  it('defines every %key% of package.json in both manifest bundles', () => {
    const manifest = readFileSync(join(root, 'package.json'), 'utf8');
    const keys = [...manifest.matchAll(/"%([^"%]+)%"/g)].map((match) => match[1]!);
    const english = readJson('package.nls.json');
    const german = readJson('package.nls.de.json');
    expect(keys.filter((key) => !english[key])).toEqual([]);
    expect(keys.filter((key) => !german[key])).toEqual([]);
    expect(Object.keys(german).sort()).toEqual(Object.keys(english).sort());
  });
});
