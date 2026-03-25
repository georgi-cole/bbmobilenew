/**
 * FinalLightsOutSequence — dramatic multi-stage house lights-out cinematic.
 *
 * Stages:
 *   0  → overhead lights start flickering off room by room
 *   1  → main hallway and kitchen go dark
 *   2  → bedrooms and diary room go dark
 *   3  → only the main TV remains lit with the farewell message
 *   4  → full blackout → calls onComplete
 */
import { useState, useEffect, useCallback } from 'react';
import './FinalLightsOutSequence.css';

export interface FinalLightsOutSequenceProps {
  publicFavoriteWinnerName?: string;
  onComplete: () => void;
}

const STAGE_DURATIONS = [2000, 1800, 1800, 3200, 1600];

export default function FinalLightsOutSequence({
  publicFavoriteWinnerName,
  onComplete,
}: FinalLightsOutSequenceProps) {
  const [stage, setStage] = useState(0);
  const [noAnim] = useState(
    () =>
      typeof document !== 'undefined' &&
      !!document.body &&
      document.body.classList.contains('no-animations'),
  );

  const advance = useCallback(() => {
    setStage((s) => s + 1);
  }, []);

  // Auto-advance through all stages
  useEffect(() => {
    if (stage >= STAGE_DURATIONS.length) {
      onComplete();
      return;
    }
    const delay = noAnim ? 0 : STAGE_DURATIONS[stage];
    const t = setTimeout(advance, delay);
    return () => clearTimeout(t);
  }, [stage, noAnim, advance, onComplete]);

  const roomLabels = ['Living Room', 'Kitchen', 'Diary Room', 'Bedroom', 'HOH Suite', 'Backyard'];

  return (
    <div
      className={`flo-overlay flo-stage-${Math.min(stage, 4)}`}
      role="dialog"
      aria-modal="true"
      aria-label="Season finale lights out"
      aria-live="polite"
    >
      {/* House silhouette zones — each dims as stages advance */}
      <div className="flo-house" aria-hidden="true">
        {roomLabels.map((room, i) => (
          <div
            key={room}
            className={`flo-room flo-room--${i + 1}${stage > i ? ' flo-room--dark' : ''}`}
          >
            <span className="flo-room__bulb">💡</span>
            <span className="flo-room__label">{room}</span>
          </div>
        ))}
      </div>

      {/* Stage 0–2: Progressive blackout overlay */}
      <div className="flo-blackout-overlay" aria-hidden="true" />

      {/* Stage 3: TV still lit — farewell message */}
      {stage === 3 && (
        <div className="flo-tv-screen" aria-label="Big Eye farewell message">
          <div className="flo-tv-frame" aria-hidden="true">
            <div className="flo-tv-scanlines" />
          </div>
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
        </div>
      )}

      {/* Stage 4+: Complete blackout */}
      {stage >= 4 && (
        <div className="flo-final-black" aria-hidden="true" />
      )}
    </div>
  );
}
