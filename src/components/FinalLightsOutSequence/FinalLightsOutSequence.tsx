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
 *   4  → TV displays farewell message: "This is not a Goodbye, it's see you soon from the Big Eye."
 *   5  → TV also dims to black
 *   6  → full blackout → calls onComplete
 */
import { useState, useEffect, useCallback } from 'react';
import './FinalLightsOutSequence.css';

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

    const updateTvViewportRect = () => {
      const viewport = document.querySelector<HTMLElement>('.tv-zone__viewport');
      if (!viewport) {
        setTvViewportRect(null);
        return;
      }

      const { top, left, width, height } = viewport.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        setTvViewportRect(null);
        return;
      }

      setTvViewportRect({ top, left, width, height });
    };

    updateTvViewportRect();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateTvViewportRect)
      : null;
    const viewport = document.querySelector<HTMLElement>('.tv-zone__viewport');
    if (resizeObserver && viewport) resizeObserver.observe(viewport);

    window.addEventListener('resize', updateTvViewportRect);
    window.addEventListener('scroll', updateTvViewportRect, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateTvViewportRect);
      window.removeEventListener('scroll', updateTvViewportRect, true);
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

      {/* ── Main TV screen area — message appears inside the existing TV viewport ── */}
      <div
        className={[
          'flo-tv-frame',
          tvViewportRect ? 'flo-tv-frame--anchored' : 'flo-tv-frame--fallback',
          stage >= 4 ? 'flo-tv-frame--active' : null,
          stage >= 5 ? 'flo-tv-frame--off' : null,
        ].filter(Boolean).join(' ')}
        style={tvViewportRect ?? undefined}
        aria-hidden={stage < 4 ? 'true' : undefined}
        data-testid="final-lights-off-tv"
      >
        <div className="flo-tv-screen-inner">
          <div className="flo-tv-scanlines" />
          {/* Farewell message appears at stage 4 */}
          {stage >= 4 && (
            <div className="flo-tv-content">
              <span className="flo-tv-logo" aria-hidden="true">👁</span>
              <p className="flo-tv-message">
                This is not a Goodbye,<br />
                it's see you soon<br />
                <em>from the Big Eye.</em>
              </p>
              {publicFavoriteWinnerName && (
                <p className="flo-tv-footnote">
                  Public's Favorite: <strong>{publicFavoriteWinnerName}</strong>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stage 6+: Complete blackout */}
      {stage >= 6 && (
        <div className="flo-final-black" aria-hidden="true" />
      )}
    </div>
  );
}
