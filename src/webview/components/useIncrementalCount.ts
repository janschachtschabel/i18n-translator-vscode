import { useEffect, useState } from 'preact/hooks';

const FIRST_ROWS = 200;
const ROWS_PER_STEP = 200;

/**
 * How many of `total` rows to render: the first ones at once, then a block per task, so that a large bundle
 * shows quickly and stays responsive. The count only grows, and it always covers `needed` rows, e.g. up to the
 * row with the focus, also when a filter moves that row past the rows rendered so far.
 */
export function useIncrementalCount(total: number, needed = 0): number {
  const [count, setCount] = useState(FIRST_ROWS);
  useEffect(() => {
    if (count >= total) {
      return undefined;
    }
    const timer = setTimeout(() => setCount((current) => current + ROWS_PER_STEP), 0);
    return () => clearTimeout(timer);
  }, [count, total]);
  return Math.min(total, Math.max(count, needed));
}
