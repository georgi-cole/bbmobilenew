import { useEffect } from 'react';
import './TvStingerOverlay.css';

interface Props {
  /** Message to display in the stinger (e.g. "Vote locked in!") */
  message?: string;
  /** Duration in ms before onDone is called. Default: 800 */
  duration?: number;
  /** Called after the stinger duration elapses */
  onDone: () => void;
}

/**
 * TvStingerOverlay — a brief full-screen overlay shown after the user
 * confirms a decision, adding suspense / pacing before the game advances.
 *
 * Rendered on top of the decision modal (z-index: 8000). Automatically
 * calls onDone after `duration` ms.
 *
 * ⚠️  `onDone` must be a stable reference (wrapped in `useCallback` by the
 * caller) to avoid restarting the timeout on every render.
 *
 * NOTE: If the component unmounts before the timeout fires (e.g. the parent
 * modal is removed before the stinger completes), onDone is NOT called and
 * the pending action is cancelled. In normal game flow this cannot happen
 * because the modals are controlled by Redux state that only clears after the
 * action dispatches.
 */
export default function TvStingerOverlay({ message = '✔ Locked in!', duration = 800, onDone }: Props) {
  useEffect(() => {
    const id = setTimeout(onDone, duration);
    return () => clearTimeout(id);
  }, [duration, onDone]);

  return (
    <div className="tv-stinger" role="dialog" aria-modal="true" aria-live="assertive">
      <div className="tv-stinger__content">
        <span className="tv-stinger__icon">🔒</span>
        <span className="tv-stinger__message">{message}</span>
      </div>
    </div>
  );
}
