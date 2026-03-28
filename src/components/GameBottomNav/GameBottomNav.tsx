import './GameBottomNav.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export type NavTab = 'home' | 'rules' | 'settings' | 'leaderboard' | 'profile';

const NAV_ITEMS: { tab: NavTab; glyph: string; label: string }[] = [
  { tab: 'home',        glyph: 'home.svg',        label: 'HOME'        },
  { tab: 'rules',       glyph: 'rules.svg',       label: 'RULES'       },
  { tab: 'settings',    glyph: 'settings.svg',    label: 'SETTINGS'    },
  { tab: 'leaderboard', glyph: 'leaderboard.svg', label: 'LEADERBOARD' },
  { tab: 'profile',     glyph: 'profile.svg',     label: 'PROFILE'     },
];

export interface GameBottomNavProps {
  activeTab: NavTab | null;
  onHomeClick?: () => void;
  onRulesClick?: () => void;
  onSettingsClick?: () => void;
  onLeaderboardClick?: () => void;
  onProfileClick?: () => void;
  /** Render children (e.g. ConfirmExitModal) after the nav */
  children?: React.ReactNode;
}


/**
 * GameBottomNav — SVG-backed bottom navigation strip.
 *
 * Uses nav_bar.svg as the visual shell, with per-tab SVG glyphs and text
 * labels overlaid as React content. Preserves full accessibility semantics.
 */
export default function GameBottomNav({
  activeTab,
  onHomeClick,
  onRulesClick,
  onSettingsClick,
  onLeaderboardClick,
  onProfileClick,
  children,
}: GameBottomNavProps) {
  const navBarSrc = `${BASE}/assets/control_dock/nav_bar.svg`;

  const handlers: Record<NavTab, (() => void) | undefined> = {
    home:        onHomeClick,
    rules:       onRulesClick,
    settings:    onSettingsClick,
    leaderboard: onLeaderboardClick,
    profile:     onProfileClick,
  };

  return (
    <>
      <nav className="game-bottom-nav nav-bar" aria-label="Main navigation">
        {/* Background shell */}
        <img
          className="game-bottom-nav__shell"
          src={navBarSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
        />

        {/* Nav items */}
        <div className="game-bottom-nav__items">
          {NAV_ITEMS.map(({ tab, glyph, label }) => {
            const isActive = activeTab === tab;
            const glyphSrc = `${BASE}/assets/control_dock/${glyph}`;
            return (
              <button
                key={tab}
                type="button"
                className={`game-bottom-nav__item${isActive ? ' game-bottom-nav__item--active' : ''}`}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                onClick={handlers[tab]}
              >
                <img
                  className="game-bottom-nav__glyph"
                  src={glyphSrc}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
                <span className="game-bottom-nav__label">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {children}
    </>
  );
}

