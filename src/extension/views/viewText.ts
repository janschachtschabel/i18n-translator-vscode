/** Bundle and locale names come from the workspace; they must not turn into Markdown, HTML or entities. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~&]/g, '\\$&');
}

/** Decoration badges hold at most two characters. */
export function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count);
}
