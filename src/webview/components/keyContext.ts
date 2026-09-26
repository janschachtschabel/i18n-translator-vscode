/**
 * What VS Code's context menu of the editor gets for a row or a card (`data-vscode-context`): the key commands
 * of the manifest show for this section, and act on the key.
 */
export function keyContext(entryId: string): string {
  return JSON.stringify({ webviewSection: 'key', entryId });
}
