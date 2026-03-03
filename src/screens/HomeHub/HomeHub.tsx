import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useBackgroundTheme from '../../hooks/useBackgroundTheme';
import IntroSplash from '../../components/IntroSplash/IntroSplash';
import AssetPreloaderOverlay from '../../components/AssetPreloaderOverlay/AssetPreloaderOverlay';
import PermissionPrompts from '../../components/PermissionPrompts/PermissionPrompts';
import { preloadImage } from '../../utils/preload';
import './HomeHub.css';

/**
 * HomeHub — entry screen with BB hero branding and button stack.
 *
 * Buttons map to named routes in src/routes.tsx.
 * To add a new hub button: add an entry to HUB_BUTTONS.
 *
 * Load ordering:
 *   1. IntroSplash shown; PermissionPrompts appear on top of the splash.
 *   2. Splash waits for logo load AND permissions resolved before dismissing.
 *   3. IMPORTANT — background loaded first: once permissions are done the hub
 *      background is preloaded before revealing buttons, so buttons never
 *      appear over an empty background.
 *   4. When Play is pressed AssetPreloaderOverlay runs (bg-first ordering
 *      enforced inside that component) then navigates to /game.
 */
const HUB_BUTTONS = [
  { to: '/game',         label: '▶  Play',          variant: 'primary'   },
  { to: '/rules',        label: '📋 Rules',         variant: 'secondary' },
  { to: '/settings',     label: '⚙️ Settings',      variant: 'secondary' },
  { to: '/profile',      label: '👤 Profile',        variant: 'secondary' },
  { to: '/leaderboard',  label: '🏆 Leaderboard',    variant: 'secondary' },
  { to: '/credits',      label: '🎬 Credits',        variant: 'ghost'     },
] as const;

export default function HomeHub() {
  const navigate = useNavigate();
  const { url: bgUrl } = useBackgroundTheme();
  const [showSplash, setShowSplash] = useState(true);
  const [permsReady, setPermsReady] = useState(false);
  // Track whether the hub background has loaded so buttons are never shown
  // on an empty background (background-first ordering).
  const [bgLoaded, setBgLoaded] = useState(false);
  const [preloading, setPreloading] = useState(false);
  const bgPreloadedRef = useRef(false);

  // Preload background as soon as its URL resolves, so it is ready before
  // the splash dismisses and buttons become visible.
  useEffect(() => {
    if (!bgUrl || bgPreloadedRef.current) return;
    bgPreloadedRef.current = true;
    preloadImage(bgUrl).then(() => setBgLoaded(true));
  }, [bgUrl]);

  const handlePlay = () => {
    // Play gesture — use this as the user gesture to attempt audio resume.
    // If the user previously remembered sound as enabled, try to resume/unlock
    // the AudioContext now. No extra "tap to enable sound" UI is ever shown.
    const soundPref = localStorage.getItem('bb:enableSound');
    if (soundPref === 'granted') {
      try {
        const ctx = new AudioContext();
        void ctx.resume().finally(() => ctx.close());
      } catch {
        // AudioContext unavailable — ignore
      }
    }
    setPreloading(true);
  };

  return (
    <>
      {/* Cold-load intro splash — shown once on first mount.
          Deferred until logo loads AND permission prompts are resolved. */}
      {showSplash && (
        <IntroSplash
          onDone={() => setShowSplash(false)}
          readyToExit={permsReady}
        />
      )}

      {/* Permission prompts shown on top of the splash (z-index > splash).
          Sound prompt intentionally disabled here — sound is enabled instead
          as part of the Play gesture to avoid a "tap to enable sound" UI on
          the intro screen. Location prompt still shown if not previously
          remembered. Once location decision is made, permsReady gates the
          splash exit. */}
      {showSplash && (
        <PermissionPrompts onComplete={() => setPermsReady(true)} showSoundPrompt={false} />
      )}

      {/* Asset preloader overlay — shown when Play is pressed */}
      {preloading && <AssetPreloaderOverlay />}

      <div className="homehub-shell">
        {/* Dynamic background layer */}
        <div
          className="homehub-intro-bg"
          style={bgUrl ? { backgroundImage: `url("${bgUrl}")` } : undefined}
          aria-hidden="true"
        />

        {/* Foreground content — buttons hidden until background has loaded
            to avoid showing the UI over an empty/transparent background. */}
        <div className="homehub-content home-hub">
          {/* Hero / icon area (no branding text — logo is shown in the splash) */}
          <div className="home-hub__hero" aria-hidden="true" />

          {/* Button stack: only rendered once background is ready */}
          {bgLoaded && (
            <nav className="home-hub__buttons" aria-label="Main menu">
              {HUB_BUTTONS.map(({ to, label, variant }) => (
                <button
                  key={to}
                  className={`home-hub__btn home-hub__btn--${variant}`}
                  onClick={to === '/game' ? handlePlay : () => navigate(to)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>
    </>
  );
}
