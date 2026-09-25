import { describe, expect, it } from 'vitest';
import { webviewHtml, type WebviewPage } from '../../../src/extension/panels/webviewHtml';

const page: WebviewPage = {
  cspSource: 'https://*.vscode-cdn.net',
  nonce: 'bm9uY2Utb2YtdGhlLXRlc3Q=',
  scriptUri: 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview/main.js',
  styleUri: 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview/main.css',
  language: 'de',
  title: 'common',
};

function policy(html: string): Map<string, string> {
  const content = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1];
  if (content === undefined) {
    throw new Error('no Content-Security-Policy');
  }
  return new Map(
    content
      .split(';')
      .map((directive) => directive.trim())
      .filter((directive) => directive !== '')
      .map((directive) => {
        const [name = '', ...sources] = directive.split(/\s+/);
        return [name, sources.join(' ')];
      }),
  );
}

describe('webviewHtml', () => {
  it('allows only what the editor needs: its script by nonce, styles and fonts of the extension', () => {
    const directives = policy(webviewHtml(page));
    expect(Object.fromEntries(directives)).toEqual({
      'default-src': "'none'",
      'script-src': `'nonce-${page.nonce}'`,
      'style-src': page.cspSource,
      'font-src': page.cspSource,
    });
  });

  it('loads the script from its file with the nonce and has no inline scripts', () => {
    const html = webviewHtml(page);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]![1]).toBe(` nonce="${page.nonce}" src="${page.scriptUri}"`);
    expect(scripts[0]![2]).toBe('');
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).toContain(`<link rel="stylesheet" href="${page.styleUri}">`);
  });

  it('names the language of the interface for screen readers', () => {
    expect(webviewHtml(page)).toMatch(/^<!DOCTYPE html>\s*<html lang="de">/);
  });

  it('escapes the values it inserts', () => {
    const html = webviewHtml({
      ...page,
      title: 'a<b & "c"',
      scriptUri: 'https://x/"><script>alert(1)</script>',
      language: 'de" onload="x',
    });
    expect(html).toContain('<title>a&lt;b &amp; &quot;c&quot;</title>');
    expect(html).toContain('src="https://x/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(html).toContain('<html lang="de&quot; onload=&quot;x">');
    expect([...html.matchAll(/<script\b/g)]).toHaveLength(1);
  });
});
