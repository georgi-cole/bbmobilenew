/**
 * IntroSplash — lightweight SVG-based intro splash shown on cold load.
 *
 * Displays a short animated SVG logo splash, then calls onDone so the
 * parent can unmount this component and reveal the main UI.
 *
 * The splash auto-dismisses after `durationMs` (default 1 800 ms).
 * It can also be dismissed instantly by clicking/tapping anywhere.
 */

import { useCallback, useEffect, useRef } from 'react';
import './IntroSplash.css';

export interface IntroSplashProps {
  /** Called when the splash should be dismissed (animation done or user tap). */
  onDone: () => void;
  /** Total visible duration in ms before auto-dismiss (default 1 800). */
  durationMs?: number;
}

const LOGO_SRC = '/assets/kolequant transp.png';

export default function IntroSplash({ onDone, durationMs = 1_800 }: IntroSplashProps) {
  const doneCalledRef = useRef(false);

  const finish = useCallback(() => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const timer = window.setTimeout(finish, durationMs);
    return () => window.clearTimeout(timer);
  }, [finish, durationMs]);

  return (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
    <div
      className="intro-splash"
      role="presentation"
      aria-hidden="true"
      onClick={finish}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') finish(); }}
      tabIndex={-1}
    >
      {/* SVG ring + pulse decoration */}
      <svg
        className="intro-splash__ring"
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="ring-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(123,92,255,0.35)" />
            <stop offset="100%" stopColor="rgba(111,183,255,0)" />
          </radialGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth="3"
          className="intro-splash__ring-circle"
        />
        <circle
          cx="100"
          cy="100"
          r="72"
          fill="rgba(123,92,255,0.08)"
          className="intro-splash__ring-pulse"
        />
      </svg>

      {/* Logo image */}
      <img
        src={LOGO_SRC}
        alt="Big Brother"
        className="intro-splash__logo"
        draggable={false}
      />

      {/* Title */}
      <p className="intro-splash__title">Big Brother</p>
    </div>
  );
}
