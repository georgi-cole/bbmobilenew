import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useBackgroundTheme from '../../hooks/useBackgroundTheme';
import IntroSplash from '../../components/IntroSplash/IntroSplash';
import AssetPreloaderOverlay from '../../components/AssetPreloaderOverlay/AssetPreloaderOverlay';
import './HomeHub.css';

/**
 * HomeHub — entry screen with BB hero branding and button stack.
 *
 * Buttons map to named routes in src/routes.tsx.
 * To add a new hub button: add an entry to HUB_BUTTONS.
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
  const [preloading, setPreloading] = useState(false);

  const handlePlay = () => {
    setPreloading(true);
  };

  return (
    <>
      {/* Cold-load intro splash — shown once on first mount */}
      {showSplash && <IntroSplash onDone={() => setShowSplash(false)} />}

      {/* Asset preloader overlay — shown when Play is pressed */}
      {preloading && <AssetPreloaderOverlay />}

      <div className="homehub-shell">
        {/* Dynamic background layer */}
        <div
          className="homehub-intro-bg"
          style={bgUrl ? { backgroundImage: `url("${bgUrl}")` } : undefined}
          aria-hidden="true"
        />

        {/* Foreground content */}
        <div className="homehub-content home-hub">
        {/* Hero / icon area */}
        <div className="home-hub__hero" aria-hidden="true">
          <h1 className="home-hub__title">Big Brother</h1>
        </div>

        {/* Button stack */}
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
        </div>
      </div>
    </>
  );
}
