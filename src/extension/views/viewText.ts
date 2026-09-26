/** Bundle and locale names come from the workspace; they must not turn into Markdown, HTML or entities. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~&]/g, '\\$&');
}

/**
 * A notification text as it is written: VS Code turns `[label](command:…)` in notifications into links that run
 * commands, and bundle, folder and file names come from the workspace. An invisible character between `]` and `(`
 * keeps any link from forming.
 */
export function plainNotice(text: string): string {
  return text.replaceAll('](', ']\u200b(');
}

/** Decoration badges hold at most two characters. */
export function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count);
}
