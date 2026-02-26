/**
 * SpotlightAnimation — viewport-tracking wrapper around CeremonyOverlay.
 *
 * Adds on top of CeremonyOverlay:
 *   - Body scroll lock (overflow: hidden) while the overlay is active.
 *   - visualViewport + window resize + capture-scroll listeners when
 *     measureA or measureB callbacks are provided, keeping cutout holes
 *     and flying badges aligned during pinch-zoom and page scroll.
 *   - ResizeObserver on tileRefs elements (if provided) to detect tile
 *     reflow due to layout changes.
 *
 * Fast-path: when neither measureA/measureB nor tileRefs are provided, no
 * additional listeners are registered — only the body scroll lock applies.
 *
 * Usage:
 *   <SpotlightAnimation
 *     tiles={[{ rect, badge: '👑' }]}
 *     caption="Alice wins HOH!"
 *     onDone={handleDone}
 *     measureA={() => getTileRect(winnerId)}
 *   />
 */

import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import CeremonyOverlay from '../CeremonyOverlay/CeremonyOverlay';
import type { CeremonyOverlayProps, CeremonyTile } from '../CeremonyOverlay/CeremonyOverlay';

export interface SpotlightAnimationProps extends Omit<CeremonyOverlayProps, 'resolveTiles'> {
  /** Re-measures tile A (index 0) position on viewport changes. */
  measureA?: () => DOMRect | null;
  /** Re-measures tile B (index 1) position on viewport changes. */
  measureB?: () => DOMRect | null;
  /**
   * Optional element refs for ResizeObserver tracking. When the observed
   * element resizes, positions are re-measured via measureA/measureB (or
   * directly from the ref's getBoundingClientRect if no callback given).
   */
  tileRefs?: RefObject<HTMLElement | null>[];
}

export default function SpotlightAnimation({
  tiles: initialTiles,
  measureA,
  measureB,
  tileRefs,
  onDone,
  ...rest
}: SpotlightAnimationProps) {
  const [tiles, setTiles] = useState<CeremonyTile[]>(initialTiles);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(true);

  const hasMeasure = measureA != null || measureB != null;
  const hasRefs = (tileRefs?.length ?? 0) > 0;

  const remeasure = useCallback(() => {
    if (!activeRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!activeRef.current) return;
      setTiles((prev) =>
        prev.map((tile, idx) => {
          const measureFn = idx === 0 ? measureA : idx === 1 ? measureB : undefined;
          const refEl = tileRefs?.[idx]?.current ?? null;
          if (!measureFn && !refEl) return tile;
          const rect = measureFn
            ? measureFn()
            : (refEl?.getBoundingClientRect() ?? null);
          if (!rect) return tile;
          return { ...tile, rect };
        }),
      );
    });
  }, [measureA, measureB, tileRefs]);

  useEffect(() => {
    activeRef.current = true;

    // Lock body scroll while the animation overlay is visible.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (!hasMeasure && !hasRefs) {
      // Fast-path: no tracking needed, only scroll lock.
      return () => {
        activeRef.current = false;
        document.body.style.overflow = prevOverflow;
      };
    }

    // Register viewport and layout-change listeners for position tracking.
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, { capture: true, passive: true });
    window.visualViewport?.addEventListener('resize', remeasure);
    window.visualViewport?.addEventListener('scroll', remeasure);

    // ResizeObserver for tile element reflow.
    let ro: ResizeObserver | null = null;
    if (hasRefs) {
      ro = new ResizeObserver(remeasure);
      for (const ref of tileRefs!) {
        if (ref.current) ro.observe(ref.current);
      }
    }

    return () => {
      activeRef.current = false;
      document.body.style.overflow = prevOverflow;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, { capture: true });
      window.visualViewport?.removeEventListener('resize', remeasure);
      window.visualViewport?.removeEventListener('scroll', remeasure);
      ro?.disconnect();
    };
  }, [hasMeasure, hasRefs, remeasure]);

  return <CeremonyOverlay {...rest} tiles={tiles} onDone={onDone} />;
}
