import { effect } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, type MutableRef } from 'preact/hooks';
import type { UiState } from '../../../shared/protocol';
import type { EditorStore } from '../../state/store';
import { anchoredScrollTop, captureAnchor, type RowBox, type ScrollAnchor } from '../../state/scrollAnchor';

/**
 * Keeps the top key in place when languages are shown or hidden or wrapping changes (design §7.1): the rows
 * change their height, and without help the view would jump. The anchor is taken when the view state changes,
 * before the table renders again, and applied after.
 */
export function useScrollAnchor(store: EditorStore, scroller: MutableRef<HTMLElement | null>): void {
  const anchor = useRef<ScrollAnchor | undefined>(undefined);
  const layout = useRef<string | undefined>(undefined);

  // A plain effect runs as soon as the state changes, while the table still shows the old layout. (Not
  // useSignalEffect: it waits for the next animation frame, when the table has already changed.)
  useEffect(
    () =>
      effect(() => {
        const key = layoutKey(store.uiState.value);
        if (layout.current !== undefined && layout.current !== key && scroller.current) {
          anchor.current = captureAnchor(rowBoxes(scroller.current), view(scroller.current));
        }
        layout.current = key;
      }),
    [store, scroller],
  );

  useLayoutEffect(() => {
    const element = scroller.current;
    const pending = anchor.current;
    if (!element || !pending) {
      return undefined;
    }
    anchor.current = undefined;
    restore(element, pending);
    // Rows near the view that content-visibility skipped are laid out only in the next frame; their new
    // height would move the anchor row again.
    const frame = requestAnimationFrame(() => restore(element, pending));
    return () => cancelAnimationFrame(frame);
  });
}

function restore(scroller: HTMLElement, anchor: ScrollAnchor): void {
  const top = anchoredScrollTop(anchor, rowBoxes(scroller));
  if (top !== undefined) {
    scroller.scrollTop = Math.max(0, top - headerHeight(scroller));
  }
}

function layoutKey(state: UiState): string {
  return JSON.stringify([state.hiddenLocales, state.wrap]);
}

function rowBoxes(scroller: HTMLElement): RowBox[] {
  return [...scroller.querySelectorAll<HTMLElement>('[data-entry]')].map((row) => ({
    id: row.dataset['entry']!,
    top: row.offsetTop,
    height: row.offsetHeight,
  }));
}

/** The part of the rows in view: below the sticky header row. */
function view(scroller: HTMLElement): { top: number; height: number } {
  const header = headerHeight(scroller);
  return { top: scroller.scrollTop + header, height: scroller.clientHeight - header };
}

function headerHeight(scroller: HTMLElement): number {
  return scroller.querySelector<HTMLElement>('.grid-head')?.offsetHeight ?? 0;
}
