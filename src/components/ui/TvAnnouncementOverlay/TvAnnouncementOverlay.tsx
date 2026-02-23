import { useEffect, useRef, useState, useCallback } from 'react';
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
 * - If `autoDismissMs` is a positive number, a countdown progress bar is shown
 *   and the overlay auto-dismisses when it reaches zero.
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

  // progress: 1 → 0 (full → empty bar)
  const [progress, setProgress] = useState(1);
  const hoverPausedRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const isPaused = () => hoverPausedRef.current || paused;

  const tick = useCallback(() => {
    if (!isAuto) return;
    const now = performance.now();
    const delta = now - startTimeRef.current;
    startTimeRef.current = now;
    elapsedRef.current += delta;

    const remaining = Math.max(0, (autoDismissMs as number) - elapsedRef.current);
    const p = remaining / (autoDismissMs as number);
    setProgress(p);

    if (remaining <= 0) {
      onDismiss();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [isAuto, autoDismissMs, onDismiss]);

  // Start the RAF countdown on mount
  useEffect(() => {
    if (!isAuto) return;
    startTimeRef.current = performance.now();
    elapsedRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isAuto, tick]);

  // Cancel/restart RAF when `paused` prop changes
  useEffect(() => {
    if (!isAuto) return;
    if (paused) {
      cancelAnimationFrame(rafRef.current);
    } else {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [paused, isAuto, tick]);

  const handleMouseEnter = () => {
    hoverPausedRef.current = true;
    cancelAnimationFrame(rafRef.current);
  };
  const handleMouseLeave = () => {
    if (!isAuto) return;
    hoverPausedRef.current = false;
    if (!isPaused()) {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
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
      rafRef.current = requestAnimationFrame(tick);
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
        ℹ️ More Info
      </button>

      {isAuto && (
        <div className="tv-announcement__progress-wrap" aria-hidden="true">
          <div
            className="tv-announcement__progress-fill"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      )}
    </div>
  );
}
