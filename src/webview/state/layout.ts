import { useEffect, useState } from 'preact/hooks';
import type { UiState } from '../../shared/protocol';

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

/** The width of the editor, updated when the panel is resized. */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}
