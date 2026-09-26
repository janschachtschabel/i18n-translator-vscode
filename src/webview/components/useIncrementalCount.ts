import { useEffect, useRef, useState } from 'preact/hooks';

const FIRST_ROWS = 200;
const ROWS_PER_STEP = 200;

/**
 * How many of `total` rows to render: the first ones at once, then a block per task, so that a large bundle
 * shows quickly and stays responsive. The count only grows, and it covers the most rows `needed` so far: e.g. up
 * to the row with the focus, also when a filter moves that row past the rows rendered so far, and still after its
 * editor closed, so that the text in the editor's place gets the focus back.
 */
export function useIncrementalCount(total: number, needed = 0): number {
  const [count, setCount] = useState(FIRST_ROWS);
  const mostNeeded = useRef(0);
  mostNeeded.current = Math.max(mostNeeded.current, needed);
  useEffect(() => {
    if (count >= total) {
      return undefined;
    }
    const timer = setTimeout(() => setCount((current) => current + ROWS_PER_STEP), 0);
    return () => clearTimeout(timer);
  }, [count, total]);
  return Math.min(total, Math.max(count, mostNeeded.current));
}
