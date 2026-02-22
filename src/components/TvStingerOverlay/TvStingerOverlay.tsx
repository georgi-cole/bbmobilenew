import { useEffect, useRef } from 'react';
import './TvStingerOverlay.css';

interface Props {
  /** Message to display in the stinger (e.g. "Vote locked in!") */
  message?: string;
  /** Duration in ms before onDone is called. Default: 900 */
  duration?: number;
  /** Called after the stinger duration elapses */
  onDone: () => void;
}

/**
 * TvStingerOverlay — a brief full-screen overlay shown after the user
 * confirms a decision, adding suspense / pacing before the game advances.
 *
 * Rendered on top of the decision modal (z-index: 8000). Automatically
 * calls onDone after `duration` ms. Tappable to skip.
 *
 * onDone is guarded internally — it will fire at most once even if the
 * user taps and the timer fires simultaneously.
 *
 * ⚠️  `onDone` must be a stable reference (wrapped in `useCallback` by the
 * caller) to avoid restarting the timeout on every render.
 */
export default function TvStingerOverlay({ message = '✔ Locked in!', duration = 900, onDone }: Props) {
  const firedRef = useRef(false);

  function fire() {
    if (firedRef.current) return;
    firedRef.current = true;
    onDone();
  }

  useEffect(() => {
    const id = setTimeout(fire, duration);
    return () => clearTimeout(id);
    // fire is stable within this render; eslint-disable below is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return (
    <div
      className="tv-stinger"
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
      onClick={fire}
    >
      <div className="tv-stinger__content">
        <span className="tv-stinger__icon">🔒</span>
        <span className="tv-stinger__message">{message}</span>
        <span className="tv-stinger__skip">tap to skip</span>
      </div>
    </div>
  );
}
