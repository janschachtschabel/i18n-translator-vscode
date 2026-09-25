import { useEffect, useState } from 'preact/hooks';

const FIRST_ROWS = 200;
const ROWS_PER_STEP = 200;

/**
 * How many of `total` rows to render: the first ones at once, then a block per task, so that a large bundle
 * shows quickly and stays responsive. The count only grows; `renderAtLeast` makes it cover a row now, e.g. the
 * one the keyboard moves to.
 */
export function useIncrementalCount(total: number): { count: number; renderAtLeast: (rows: number) => void } {
  const [count, setCount] = useState(FIRST_ROWS);
  useEffect(() => {
    if (count >= total) {
      return undefined;
    }
    const timer = setTimeout(() => setCount((current) => current + ROWS_PER_STEP), 0);
    return () => clearTimeout(timer);
  }, [count, total]);
  return {
    count: Math.min(count, total),
    renderAtLeast: (rows) => setCount((current) => Math.max(current, rows)),
  };
}
