import type { UiState } from '../../shared/protocol';
import type { LocaleView } from '../../shared/viewModel';

/** How the editor shows the rows: a table, a card per key, or cards with the reference and one language. */
export type Layout = 'table' | 'list' | 'compact';

const TABLE_FROM = 900;
const COMPACT_UP_TO = 480;

/** The layout for the editor's width (design §7.1); a layout the user chose wins. */
export function layoutFor(choice: UiState['layout'], width: number): Layout {
  if (choice !== 'auto') {
    return choice;
  }
  return width >= TABLE_FROM ? 'table' : width > COMPACT_UP_TO ? 'list' : 'compact';
}

/**
 * The reference and the one language the compact list shows beside it: the chosen one, else the first
 * visible full language (a variant leaves most texts to its base), else any.
 */
export function compactLocales(
  locales: readonly LocaleView[],
  hidden: readonly string[],
  chosen: string | null,
): LocaleView[] {
  const reference = locales.find((locale) => locale.reference);
  const others = locales.filter((locale) => !locale.reference);
  const second =
    others.find((locale) => locale.code === chosen) ??
    others.find((locale) => !locale.variant && !hidden.includes(locale.code)) ??
    others[0];
  return [reference, second].filter((locale) => locale !== undefined);
}
