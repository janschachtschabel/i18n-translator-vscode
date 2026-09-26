/**
 * What VS Code's context menu of the editor gets for a row or a card (`data-vscode-context`): the key commands
 * of the manifest show for this section, and act on the key; for a mail template, the preview shows too.
 */
export function keyContext(entryId: string, mailTemplate: boolean): string {
  return JSON.stringify({ webviewSection: 'key', entryId, ...(mailTemplate ? { mailTemplate } : {}) });
}
