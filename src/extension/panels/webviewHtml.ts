/** What the page of the editor webview is made of. */
export interface WebviewPage {
  /** `webview.cspSource`: the origin of the extension's files, for styles and fonts. */
  cspSource: string;
  /** Random per page; only the script carrying it may run. */
  nonce: string;
  scriptUri: string;
  styleUri: string;
  /** Language of the VS Code interface (`vscode.env.language`), so screen readers pick the right voice. */
  language: string;
  title: string;
}

/**
 * The page of the editor webview. Its Content Security Policy allows the one script with the nonce and the
 * extension's styles and fonts, nothing else: no inline scripts or styles, no network.
 */
export function webviewHtml(page: WebviewPage): string {
  const policy = [
    "default-src 'none'",
    `script-src 'nonce-${page.nonce}'`,
    `style-src ${page.cspSource}`,
    `font-src ${page.cspSource}`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="${escapeHtml(page.language)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${escapeHtml(page.styleUri)}">
<title>${escapeHtml(page.title)}</title>
</head>
<body>
<div id="root"></div>
<script nonce="${escapeHtml(page.nonce)}" src="${escapeHtml(page.scriptUri)}"></script>
</body>
</html>
`;
}

const ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** For text and double-quoted attribute values, the only places the page inserts values. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ENTITIES[char]!);
}
