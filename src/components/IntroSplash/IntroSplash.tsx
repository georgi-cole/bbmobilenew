/**
 * IntroSplash — lightweight SVG-based intro splash shown on cold load.
 *
 * Displays a short animated SVG logo splash, then calls onDone so the
 * parent can unmount this component and reveal the main UI.
 *
 * The splash auto-dismisses after `durationMs` (default 1 800 ms) once the
 * logo has settled (loaded or errored) and `readyToExit` is true.
 * It can also be dismissed instantly by clicking/tapping anywhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './IntroSplash.css';

export interface IntroSplashProps {
  /** Called when the splash should be dismissed (animation done or user tap). */
  onDone: () => void;
  /** Total visible duration in ms before auto-dismiss (default 1 800). */
  durationMs?: number;
  /**
   * External gate: when false the timer will still run but onDone is deferred
   * until this becomes true (e.g. permission prompts resolved). Defaults to true.
   */
  readyToExit?: boolean;
}

// Encode the filename that contains a space so browsers always resolve the path.
const LOGO_SRC = `/assets/${encodeURIComponent('kolequant transp.png')}`;

/** Inline SVG fallback shown when the logo image fails to load. */
function FallbackLogo() {
  return (
    <svg
      className="intro-splash__logo intro-splash__logo--fallback"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="48" fill="rgba(123,92,255,0.25)" stroke="rgba(123,92,255,0.7)" strokeWidth="2" />
      <text x="50" y="58" textAnchor="middle" fontSize="38" fontWeight="bold" fill="#fff" fontFamily="sans-serif">BB</text>
    </svg>
  );
}

export default function IntroSplash({
  onDone,
  durationMs = 1_800,
  readyToExit = true,
}: IntroSplashProps) {
  const doneCalledRef = useRef(false);
  const timerDoneRef = useRef(false);
  const [logoSettled, setLogoSettled] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const tryFinish = useCallback(() => {
    if (doneCalledRef.current) return;
    if (!timerDoneRef.current) return;
    if (!logoSettled) return;
    if (!readyToExit) return;
    doneCalledRef.current = true;
    onDone();
  }, [onDone, logoSettled, readyToExit]);

  // Auto-dismiss timer — sets timerDone then attempts to finish.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      timerDoneRef.current = true;
      // Also treat logo as settled after timeout to avoid stalling.
      setLogoSettled(true);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs]);

  // Attempt finish whenever any gate changes.
  useEffect(() => {
    tryFinish();
  }, [tryFinish]);

  const handleLogoLoad = useCallback(() => {
    // Logo loaded — mark as settled. The timer still controls when the splash
    // exits (durationMs minimum), so we do NOT set timerDoneRef here.
    setLogoSettled(true);
  }, []);

  const handleLogoError = useCallback(() => {
    // Logo failed — switch to fallback SVG and mark settled. The timer still
    // controls splash duration so we do NOT set timerDoneRef here.
    setLogoError(true);
    setLogoSettled(true);
  }, []);

  const handleTap = useCallback(() => {
    timerDoneRef.current = true;
    setLogoSettled(true);
  }, []);

  return (
    <div
      className="intro-splash"
      role="presentation"
      aria-hidden="true"
      onClick={handleTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTap(); }}
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

      {/* Logo: image with inline SVG fallback on error */}
      {logoError ? (
        <FallbackLogo />
      ) : (
        <img
          src={LOGO_SRC}
          alt="Big Brother"
          className="intro-splash__logo"
          draggable={false}
          onLoad={handleLogoLoad}
          onError={handleLogoError}
        />
      )}
    </div>
  );
}
