import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useBackgroundTheme from '../../hooks/useBackgroundTheme';
import KolequantSplash from '../../components/KolequantSplash/KolequantSplash';
import AssetPreloaderOverlay from '../../components/AssetPreloaderOverlay/AssetPreloaderOverlay';
import PermissionPrompts from '../../components/PermissionPrompts/PermissionPrompts';
import { SoundManager } from '../../services/sound/SoundManager';
import { preloadImage } from '../../utils/preload';
import './HomeHub.css';

/**
 * HomeHub — entry screen with BB hero branding and button stack.
 *
 * Buttons map to named routes in src/routes.tsx.
 * To add a new hub button: add an entry to HUB_BUTTONS.
 *
 * Load ordering:
 *   1. KolequantSplash shown — logo only, no dialogs, hub preloads in background.
 *   2. Splash fades out after ~1.2s animation completes automatically.
 *   3. IMPORTANT — background loaded first: hub background is preloaded during
 *      the splash so buttons never appear over an empty background.
 *   4. After splash exits, PermissionPrompts appear over the hub (location only;
 *      sound is unlocked via the Play gesture instead).
 *   5. When Play is pressed AssetPreloaderOverlay runs then navigates to /game.
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
  const [splashDone, setSplashDone] = useState(false);
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
    // Play gesture — always unlock the Web Audio API here so that AudioGate
    // is not needed on the Intro/Home route.  This satisfies browser autoplay
    // policy: the first user gesture on the home screen unlocks audio context.
    SoundManager.unlockOnUserGesture();
    setPreloading(true);
  };

  return (
    <>
      {/* Cold-load intro splash — logo only, hub preloads in background.
          Exits automatically after the animation completes (~1.2s). */}
      {!splashDone && (
        <KolequantSplash onFinish={() => setSplashDone(true)} />
      )}

      {/* Permission prompts shown after splash exits, over the hub.
          Sound prompt disabled — sound is unlocked via the Play gesture. */}
      {splashDone && (
        <PermissionPrompts showSoundPrompt={false} />
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

          {/* Button stack: only rendered once background is ready AND splash has dismissed,
              to prevent accidental clicks through the pointer-events: none splash overlay. */}
          {splashDone && bgLoaded && (
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
