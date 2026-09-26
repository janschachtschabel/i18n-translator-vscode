import { useEffect, useRef, useState } from 'preact/hooks';

const FIRST_ROWS = 200;
const ROWS_PER_STEP = 200;

/**
 * How many of `total` rows to render: the first ones at once, then a block per task, so that a large bundle
 * shows quickly and stays responsive. Fewer rows (a narrower filter) lower the allowance to them, so that rows a
 * wider filter brings back come in blocks too, not all in one task. It covers the most rows `needed` so far: e.g.
 * up to the row with the focus, also when a filter moves that row past the rows rendered so far, and still after
 * its editor closed, so that the text in the editor's place gets the focus back.
 */
export function useIncrementalCount(total: number, needed = 0): number {
  const [, next] = useState(0);
  const allowed = useRef(FIRST_ROWS);
  const mostNeeded = useRef(0);
  mostNeeded.current = Math.max(mostNeeded.current, needed);
  allowed.current = Math.min(allowed.current, Math.max(FIRST_ROWS, total));
  const count = Math.min(total, Math.max(allowed.current, mostNeeded.current));
  useEffect(() => {
    if (count >= total) {
      return undefined;
    }
    const timer = setTimeout(() => {
      allowed.current = count + ROWS_PER_STEP;
      next((step) => step + 1);
    }, 0);
    return () => clearTimeout(timer);
  }, [count, total]);
  return count;
}
