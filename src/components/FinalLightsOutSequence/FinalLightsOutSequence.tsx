/**
 * FinalLightsOutSequence — dramatic lights-out cinematic using the main screen as canvas.
 *
 * Overlays the existing game UI rather than replacing it with abstract room tiles.
 *
 * Stages:
 *   0  → overlay fades in; left/right light rails visible
 *   1  → top pair of side lights go dark
 *   2  → middle pairs go dark (left & right simultaneously)
 *   3  → bottom pairs go dark — only the central TV frame remains lit
 *   4  → TV begins dimming toward black
 *   5  → TV fully powers down
 *   6  → full blackout → calls onComplete
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import './FinalLightsOutSequence.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface FinalLightsOutSequenceProps {
  publicFavoriteWinnerName?: string;
  onComplete: () => void;
}

type TvViewportRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function areViewportRectsEqual(a: TvViewportRect | null, b: TvViewportRect | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

// Number of light rows on each side (each pair goes off together)
const LIGHT_ROWS = 5;
// Durations for each stage (ms)
const STAGE_DURATIONS = [800, 1400, 1400, 1400, 3000, 1800, 1400];

export default function FinalLightsOutSequence({
  publicFavoriteWinnerName,
  onComplete,
}: FinalLightsOutSequenceProps) {
  const [stage, setStage] = useState(0);
  const [tvViewportRect, setTvViewportRect] = useState<TvViewportRect | null>(null);
  const [tvZoneRect, setTvZoneRect] = useState<TvViewportRect | null>(null);
  const rafRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const observedViewportRef = useRef<HTMLElement | null>(null);
  const observedZoneRef = useRef<HTMLElement | null>(null);
  const lastMeasuredRectRef = useRef<TvViewportRect | null>(null);
  const lastMeasuredZoneRectRef = useRef<TvViewportRect | null>(null);
  const [noAnim] = useState(
    () =>
      typeof document !== 'undefined' &&
      !!document.body &&
      document.body.classList.contains('no-animations'),
  );

  const advance = useCallback(() => {
    setStage((s) => s + 1);
  }, []);

  useEffect(() => {
    if (stage >= STAGE_DURATIONS.length) {
      onComplete();
      return;
    }
    const delay = noAnim ? 0 : STAGE_DURATIONS[stage];
    const t = setTimeout(advance, delay);
    return () => clearTimeout(t);
  }, [stage, noAnim, advance, onComplete]);

  // How many light rows are currently dark: stage 1 → row 0, stage 2 → rows 0-1, etc.
  const darkRows = Math.max(0, stage - 1);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const getViewport = () => document.querySelector<HTMLElement>('.tv-zone__viewport');
    const getTvZone = () => document.querySelector<HTMLElement>('.tv-zone');
    const requestFrame =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16);
    const cancelFrame =
      typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);

    const setMeasuredRect = (nextRect: TvViewportRect | null) => {
      if (areViewportRectsEqual(lastMeasuredRectRef.current, nextRect)) return;
      lastMeasuredRectRef.current = nextRect;
      setTvViewportRect(nextRect);
    };

    const setMeasuredZoneRect = (nextRect: TvViewportRect | null) => {
      if (areViewportRectsEqual(lastMeasuredZoneRectRef.current, nextRect)) return;
      lastMeasuredZoneRectRef.current = nextRect;
      setTvZoneRect(nextRect);
    };

    const attachResizeObserver = (viewport: HTMLElement | null, zone: HTMLElement | null) => {
      if (observedViewportRef.current === viewport && observedZoneRef.current === zone) return;

      resizeObserverRef.current?.disconnect();
      observedViewportRef.current = viewport;
      observedZoneRef.current = zone;

      if (typeof ResizeObserver === 'undefined') {
        resizeObserverRef.current = null;
        return;
      }

      resizeObserverRef.current = new ResizeObserver(() => {
        scheduleRefresh();
      });
      if (viewport) resizeObserverRef.current.observe(viewport);
      if (zone && zone !== viewport) resizeObserverRef.current.observe(zone);
    };

    const measureTvViewport = (viewport: HTMLElement | null) => {
      if (!viewport) {
        setMeasuredRect(null);
        return null;
      }

      const { top, left, width, height } = viewport.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        setMeasuredRect(null);
        return viewport;
      }

      setMeasuredRect({ top, left, width, height });
      return viewport;
    };

    const measureTvZone = (zone: HTMLElement | null) => {
      if (!zone) {
        setMeasuredZoneRect(null);
        return null;
      }

      const { top, left, width, height } = zone.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        setMeasuredZoneRect(null);
        return zone;
      }

      setMeasuredZoneRect({ top, left, width, height });
      return zone;
    };

    const refreshTvViewportRect = () => {
      const viewport = getViewport();
      const zone = getTvZone();
      attachResizeObserver(viewport, zone);
      measureTvViewport(viewport);
      measureTvZone(zone);
    };

    const scheduleRefresh = () => {
      if (rafRef.current) cancelFrame(rafRef.current);
      rafRef.current = requestFrame(() => {
        rafRef.current = 0;
        refreshTvViewportRect();
      });
    };

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
          scheduleRefresh();
        })
        : null;

    scheduleRefresh();

    window.addEventListener('resize', scheduleRefresh);
    window.addEventListener('scroll', scheduleRefresh, { capture: true, passive: true });
    window.visualViewport?.addEventListener('resize', scheduleRefresh);
    window.visualViewport?.addEventListener('scroll', scheduleRefresh);
    mutationObserver?.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (rafRef.current) cancelFrame(rafRef.current);
      resizeObserverRef.current?.disconnect();
      observedZoneRef.current = null;
      mutationObserver?.disconnect();
      window.removeEventListener('resize', scheduleRefresh);
      window.removeEventListener('scroll', scheduleRefresh, true);
      window.visualViewport?.removeEventListener('resize', scheduleRefresh);
      window.visualViewport?.removeEventListener('scroll', scheduleRefresh);
    };
  }, []);

  return (
    <div
      className={`flo-overlay flo-stage-${Math.min(stage, STAGE_DURATIONS.length - 1)}`}
      role="dialog"
      aria-modal="true"
      aria-label="Season finale lights out"
      aria-live="polite"
    >
      {/* Progressive dark overlay — deepens as stages advance */}
      <div className="flo-bg-overlay" aria-hidden="true" />

      {/* ── Left light rail ── */}
      <div className="flo-light-rail flo-light-rail--left" aria-hidden="true">
        {Array.from({ length: LIGHT_ROWS }).map((_, i) => (
          <div
            key={i}
            className={`flo-light-row${i < darkRows ? ' flo-light-row--off' : ''}`}
          >
            <span className="flo-light flo-light--a" />
            <span className="flo-light flo-light--b" />
          </div>
        ))}
      </div>

      {/* ── Right light rail ── */}
      <div className="flo-light-rail flo-light-rail--right" aria-hidden="true">
        {Array.from({ length: LIGHT_ROWS }).map((_, i) => (
          <div
            key={i}
            className={`flo-light-row${i < darkRows ? ' flo-light-row--off' : ''}`}
          >
            <span className="flo-light flo-light--a" />
            <span className="flo-light flo-light--b" />
          </div>
        ))}
      </div>

      <div
        className={[
          'flo-tv-shell',
          tvZoneRect ? 'flo-tv-shell--anchored' : 'flo-tv-shell--fallback',
          'flo-tv-shell--active',
          stage >= 5 ? 'flo-tv-shell--off' : null,
        ].filter(Boolean).join(' ')}
        style={tvZoneRect ?? undefined}
        data-testid="final-lights-off-tv-shell"
        aria-hidden="true"
      />

      {/* ── Main TV screen area — message appears inside the existing TV viewport ── */}
      <div
        className={[
          'flo-tv-frame',
          tvViewportRect ? 'flo-tv-frame--anchored' : 'flo-tv-frame--fallback',
          'flo-tv-frame--active',
          stage >= 5 ? 'flo-tv-frame--off' : null,
        ].filter(Boolean).join(' ')}
        style={tvViewportRect ?? undefined}
        data-testid="final-lights-off-tv"
      >
        <div className="flo-tv-screen-inner">
          <div className="flo-tv-scanlines" />
          <div className="flo-tv-content">
            <span className="flo-tv-logo" aria-hidden="true">
              <img
                className="flo-tv-logo-image"
                src={`${BASE}/assets/avatar_badges/goodbye_eye_vector.svg`}
                alt=""
              />
            </span>
            <p className="flo-tv-message">
              <span>This is not a Goodbye,</span>
              <span>it's see you soon</span>
              <span className="flo-tv-message-signoff">from the Big Eye.</span>
            </p>
            {publicFavoriteWinnerName && (
              <p className="flo-tv-footnote">
                Public's Favorite: <strong>{publicFavoriteWinnerName}</strong>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stage 6+: Complete blackout */}
      {stage >= 6 && (
        <div className="flo-final-black" aria-hidden="true" />
      )}
    </div>
  );
}
