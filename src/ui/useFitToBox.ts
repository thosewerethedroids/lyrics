import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Finds the largest font size at which the content still fits its box.
 *
 * Performance mode should never need scrolling: looking down to find the next line is the moment
 * you lose your place. So rather than pick a size and let the song overflow, the size is solved
 * for — binary search over `min..max`, measuring after each try.
 *
 * "Fits" means no overflow in *either* axis. In a multi-column box, content that runs long spills
 * into further columns off to the right, so it shows up as horizontal overflow; in a single column
 * it shows up as vertical. Checking both covers each case without the caller caring which.
 *
 * The search runs against the real DOM because text layout is the only reliable measure of text —
 * line wrapping, column balancing and the chord/syllable stacking are far too coupled to model.
 * Around 7 iterations settles a 12..160px range, all inside one frame before paint.
 */
export function useFitToBox(
  /** The element whose overflow decides the fit. Its font size is what gets set. */
  ref: React.RefObject<HTMLElement | null>,
  options: {
    enabled: boolean;
    min?: number;
    max?: number;
    /** Change this whenever the content or layout changes, to re-solve. */
    deps: unknown[];
  },
): number | null {
  const { enabled, min = 12, max = 160, deps } = options;
  const [size, setSize] = useState<number | null>(null);
  const frame = useRef<number>(0);

  const solve = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    if (!enabled) {
      // Leave `--chart-size` alone: when auto-fit is off the caller sets it from the user's own
      // choice, and clearing it here would wipe that value right after React applied it.
      setSize(null);
      return;
    }

    const fits = () =>
      el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;

    let low = min;
    let high = max;
    let best = min;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      el.style.setProperty('--chart-size', `${mid}px`);
      // Reading a layout property here forces a synchronous reflow, which is exactly what makes
      // the next measurement reflect this size.
      if (fits()) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    el.style.setProperty('--chart-size', `${best}px`);
    setSize(best);
  }, [ref, enabled, min, max]);

  // Layout effect so the solved size is in place before the browser paints — otherwise every
  // song change would flash at the previous song's size.
  useLayoutEffect(() => {
    solve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solve, ...deps]);

  // Re-solve when the box changes: rotation, a resized window, the control bar appearing.
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(solve);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame.current);
      observer.disconnect();
    };
  }, [ref, enabled, solve]);

  return size;
}
