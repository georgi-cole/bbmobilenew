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
}

/**
 * TvAnnouncementOverlay — broadcast stinger rendered inside the TV viewport.
 *
 * - If `autoDismissMs` is a positive number, a countdown progress bar is shown
 *   and the overlay auto-dismisses when it reaches zero.
 * - The countdown pauses while the component is hovered or focused.
 * - The info button calls `onInfo`; `onDismiss` hides the overlay.
 */
export default function TvAnnouncementOverlay({
  announcement,
  onInfo,
  onDismiss,
}: TvAnnouncementOverlayProps) {
  const { title, subtitle, isLive, autoDismissMs } = announcement;

  const isAuto = typeof autoDismissMs === 'number' && autoDismissMs > 0;

  // progress: 1 → 0 (full → empty bar)
  const [progress, setProgress] = useState(1);
  const pausedRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

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

  useEffect(() => {
    if (!isAuto) return;
    startTimeRef.current = performance.now();
    elapsedRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isAuto, tick]);

  const handleMouseEnter = () => {
    pausedRef.current = true;
    cancelAnimationFrame(rafRef.current);
  };
  const handleMouseLeave = () => {
    if (!isAuto) return;
    pausedRef.current = false;
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  };
  const handleFocus = () => {
    pausedRef.current = true;
    cancelAnimationFrame(rafRef.current);
  };
  const handleBlur = () => {
    if (!isAuto) return;
    pausedRef.current = false;
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
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
