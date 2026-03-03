/**
 * IntroSplash — logo-only intro splash shown on cold load.
 *
 * Displays the KoleQuant logo, then calls onDone/onFinish so the parent can
 * unmount this component and reveal the main UI.
 *
 * All waits are bounded:
 *   - maxLogoWaitMs caps how long we wait for the logo image (default 2 000 ms).
 *   - minVisibleMs / durationMs is the minimum total visible time (default 1 800 ms).
 * The splash auto-dismisses after the logo has settled and the minimum visible
 * timer has completed. After the minimum visible time has elapsed, it can also
 * be dismissed by clicking/tapping anywhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './IntroSplash.css';

export interface IntroSplashProps {
  /** Called when the splash finishes (animation done or user tap). */
  onFinish?: () => void;
  /** Alias for onFinish (kept for backward compatibility). */
  onDone?: () => void;
  /** Minimum visible duration in ms before auto-dismiss (default 1 800). */
  minVisibleMs?: number;
  /** Alias for minVisibleMs (kept for backward compatibility). */
  durationMs?: number;
  /** Maximum ms to wait for the logo image before showing the fallback (default 2 000). */
  maxLogoWaitMs?: number;
  /** Duration of the fade-out animation in ms (default 350). */
  fadeOutMs?: number;
}

// Logo lives at public/assets/kolequant.png — use BASE_URL so it works with any Vite base path.
const LOGO_SRC = `${import.meta.env.BASE_URL}assets/kolequant.png`;

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
  onFinish,
  onDone,
  minVisibleMs,
  durationMs = 1_800,
  maxLogoWaitMs = 2_000,
  fadeOutMs = 350,
}: IntroSplashProps) {
  // Resolve callback — prefer onFinish, fall back to onDone.
  const callback = onFinish ?? onDone;

  if (import.meta.env.DEV && !callback) {
    console.warn('[IntroSplash] Neither onFinish nor onDone was provided — the splash will never dismiss.');
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const doneCalledRef = useRef(false);
  const timerDoneRef = useRef(false);
  const [logoSettled, setLogoSettled] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Effective minimum visible time (minVisibleMs takes precedence over durationMs).
  const visibleMs = minVisibleMs ?? durationMs;

  // Apply the exit animation class directly on the DOM element (avoids calling
  // setState from within an effect, which triggers cascading renders).
  const startExit = useCallback(() => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    containerRef.current?.classList.add('intro-splash--exit');
    // Wait for fade-out before calling the callback so the parent unmounts cleanly.
    window.setTimeout(() => callback?.(), fadeOutMs);
  }, [callback, fadeOutMs]);

  const tryFinish = useCallback(() => {
    if (doneCalledRef.current) return;
    if (!timerDoneRef.current) return;
    if (!logoSettled) return;
    startExit();
  }, [logoSettled, startExit]);

  // Minimum-visible timer — sets timerDone then attempts to finish.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      timerDoneRef.current = true;
      // Also treat logo as settled after timeout to avoid stalling.
      setLogoSettled(true);
    }, visibleMs);
    return () => window.clearTimeout(timer);
  }, [visibleMs]);

  // Bounded logo-wait: if the image hasn't loaded within maxLogoWaitMs, show fallback.
  // The timer is cancelled via the ref if the logo loads or errors first.
  const logoWaitTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  useEffect(() => {
    logoWaitTimerRef.current = window.setTimeout(() => {
      setLogoError(true);
      setLogoSettled(true);
    }, maxLogoWaitMs);
    return () => {
      if (logoWaitTimerRef.current !== null) {
        window.clearTimeout(logoWaitTimerRef.current);
      }
    };
  }, [maxLogoWaitMs]);

  // Attempt finish whenever any gate changes.
  useEffect(() => {
    tryFinish();
  }, [tryFinish]);

  const handleLogoLoad = useCallback(() => {
    // Logo loaded — clear the logo-wait timer so it cannot overwrite with error state.
    if (logoWaitTimerRef.current !== null) {
      window.clearTimeout(logoWaitTimerRef.current);
      logoWaitTimerRef.current = null;
    }
    // Mark settled. The minimum-visible timer still controls when the splash
    // exits (visibleMs minimum), so we do NOT set timerDoneRef here.
    setLogoSettled(true);
  }, []);

  const handleLogoError = useCallback(() => {
    // Logo failed — clear the logo-wait timer and switch to fallback SVG.
    if (logoWaitTimerRef.current !== null) {
      window.clearTimeout(logoWaitTimerRef.current);
      logoWaitTimerRef.current = null;
    }
    setLogoError(true);
    setLogoSettled(true);
  }, []);

  const handleTap = useCallback(() => {
    timerDoneRef.current = true;
    setLogoSettled(true);
  }, []);

  return (
    <div
      ref={containerRef}
      className="intro-splash"
      role="button"
      aria-label="Skip intro"
      tabIndex={0}
      onClick={handleTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTap(); }}
    >
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
