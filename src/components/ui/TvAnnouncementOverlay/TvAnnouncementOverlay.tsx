import { useEffect, useLayoutEffect, useRef } from 'react';
import './TvAnnouncementOverlay.css';

export interface Announcement {
  key: string;
  title: string;
  subtitle: string;
  isLive: boolean;
  /** ms until auto-dismiss; null = manual dismiss only */
  autoDismissMs: number | null;
}

export interface TvAnnouncementOverlayProps {
  announcement: Announcement;
  onInfo: () => void;
  onDismiss: () => void;
  /** When true, the auto-dismiss countdown is paused (e.g. while info modal is open). */
  paused?: boolean;
}

/**
 * TvAnnouncementOverlay — broadcast stinger rendered inside the TV viewport.
 *
 * - If `autoDismissMs` is a positive number, the overlay auto-dismisses when
 *   the countdown reaches zero (silently — no visible progress bar).
 * - The countdown pauses while the component is hovered, focused, or when
 *   `paused` is true (e.g. while the info modal is open).
 * - The info button calls `onInfo`; `onDismiss` hides the overlay.
 */
export default function TvAnnouncementOverlay({
  announcement,
  onInfo,
  onDismiss,
  paused = false,
}: TvAnnouncementOverlayProps) {
  const { title, subtitle, isLive, autoDismissMs } = announcement;

  const isAuto = typeof autoDismissMs === 'number' && autoDismissMs > 0;

  const hoverPausedRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  // Stable ref to the tick function — updated after every render via
  // useLayoutEffect so it always closes over the latest props/state.
  // Using a ref avoids the self-referencing useCallback pattern that the
  // react-hooks/immutability rule rejects.
  const tickRef = useRef<() => void>(() => {});

  const isPaused = () => hoverPausedRef.current || paused;

  // Keep tickRef.current pointing at the latest implementation.
  // useLayoutEffect runs synchronously after DOM mutations but before any
  // browser paint or RAF callbacks, ensuring the function is always fresh.
  useLayoutEffect(() => {
    tickRef.current = () => {
      if (!isAuto) return;
      const now = performance.now();
      const delta = now - startTimeRef.current;
      startTimeRef.current = now;
      elapsedRef.current += delta;

      const remaining = Math.max(0, (autoDismissMs as number) - elapsedRef.current);

      if (remaining <= 0) {
        onDismiss();
        return;
      }
      rafRef.current = requestAnimationFrame(tickRef.current);
    };
  }); // No deps — intentionally runs after every render

  // Start the RAF countdown when isAuto becomes true
  useEffect(() => {
    if (!isAuto) return;
    startTimeRef.current = performance.now();
    elapsedRef.current = 0;
    rafRef.current = requestAnimationFrame(tickRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isAuto]); // tickRef is a stable ref object; .current is always fresh

  // Cancel/restart RAF when `paused` prop changes
  useEffect(() => {
    if (!isAuto) return;
    if (paused) {
      cancelAnimationFrame(rafRef.current);
    } else {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tickRef.current);
    }
  }, [paused, isAuto]); // tickRef is a stable ref object; .current is always fresh

  const handleMouseEnter = () => {
    hoverPausedRef.current = true;
    cancelAnimationFrame(rafRef.current);
  };
  const handleMouseLeave = () => {
    if (!isAuto) return;
    hoverPausedRef.current = false;
    if (!isPaused()) {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tickRef.current);
    }
  };
  const handleFocus = () => {
    hoverPausedRef.current = true;
    cancelAnimationFrame(rafRef.current);
  };
  const handleBlur = () => {
    if (!isAuto) return;
    hoverPausedRef.current = false;
    if (!isPaused()) {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tickRef.current);
    }
  };

  return (
    <div
      className="tv-announcement"
      role="dialog"
      aria-modal="false"
      aria-live="polite"
      aria-label={`Announcement: ${title}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {isLive && (
        <div className="tv-announcement__live" aria-label="Live broadcast">
          <span className="tv-announcement__live-dot" aria-hidden="true" />
          LIVE
        </div>
      )}

      <div className="tv-announcement__body">
        <p className="tv-announcement__title">{title}</p>
        {subtitle && <p className="tv-announcement__subtitle">{subtitle}</p>}
      </div>

      <button
        className="tv-announcement__info-btn"
        onClick={onInfo}
        aria-label={`More info about ${title}`}
      >
        ℹ️
      </button>
    </div>
  );
}
