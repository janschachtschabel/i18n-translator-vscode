import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectL10nCalls } from './support/l10nCollector';

const root = join(__dirname, '..', '..');

function readJson(relPath: string): Record<string, string> {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8')) as Record<string, string>;
}

function runtimeMessages(): { messages: string[]; problems: string[] } {
  const messages = new Set<string>();
  const problems: string[] = [];
  const files = readdirSync(join(root, 'src/extension'), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
  for (const file of files) {
    const result = collectL10nCalls(readFileSync(file, 'utf8'), relative(root, file));
    result.messages.forEach((message) => messages.add(message));
    problems.push(...result.problems);
  }
  return { messages: [...messages].sort(), problems };
}

describe('collectL10nCalls', () => {
  it('collects single-quoted, double-quoted and plain template literals', () => {
    const source = `vscode.l10n.t('Hello {0}', name); l10n.t("Don't show again"); l10n.t(\`Plain\`);`;
    expect(collectL10nCalls(source, 'a.ts').messages).toEqual(['Hello {0}', "Don't show again", 'Plain']);
  });

  it('returns the cooked string value of escape sequences', () => {
    expect(collectL10nCalls(String.raw`l10n.t('Line one\nLine two')`, 'a.ts').messages).toEqual([
      'Line one\nLine two',
    ]);
  });

  it('ignores calls inside comments', () => {
    expect(collectL10nCalls(`// l10n.t('commented out')\n/* l10n.t('block') */`, 'a.ts').messages).toEqual([]);
  });

  it('reports calls whose first argument is not a string literal', () => {
    const result = collectL10nCalls(`l10n.t({ message: 'x', args: [] });\nl10n.t(template);`, 'a.ts');
    expect(result.messages).toEqual([]);
    expect(result.problems).toEqual([
      'a.ts:1: l10n.t() needs a string literal as its first argument',
      'a.ts:2: l10n.t() needs a string literal as its first argument',
    ]);
  });
});

describe('localization', () => {
  it('passes only string literals to l10n.t()', () => {
    expect(runtimeMessages().problems).toEqual([]);
  });

  it('translates every runtime message to German', () => {
    const german = readJson('l10n/bundle.l10n.de.json');
    expect(runtimeMessages().messages.filter((message) => !german[message])).toEqual([]);
  });

  it('has no stale entries in the German runtime bundle', () => {
    const used = new Set(runtimeMessages().messages);
    expect(Object.keys(readJson('l10n/bundle.l10n.de.json')).filter((key) => !used.has(key))).toEqual([]);
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
