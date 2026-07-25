import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRefinedGameChrome } from '../../hooks/useRefinedGameChrome';
import './GameBottomNav.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export type NavTab = 'home' | 'rules' | 'settings' | 'leaderboard' | 'profile' | 'store';

type PrimaryItem = { tab: NavTab; glyph: string; label: string; accessibleLabel: string };
const CONTROL_ITEMS: PrimaryItem[] = [
  { tab: 'home', glyph: 'home_approved_final.svg', label: 'HOME', accessibleLabel: 'HOME' },
  { tab: 'rules', glyph: 'rules_approved_final.svg', label: 'RULES', accessibleLabel: 'RULES' },
  { tab: 'settings', glyph: 'settings_approved_final.svg', label: 'SETTINGS', accessibleLabel: 'SETTINGS' },
  { tab: 'leaderboard', glyph: 'leaderboard_approved_final.svg', label: 'BOARD', accessibleLabel: 'BOARD' },
  { tab: 'profile', glyph: 'profile_approved_final.svg', label: 'USER', accessibleLabel: 'USER' },
];
const REFINED_ITEMS: PrimaryItem[] = [
  { tab: 'home', glyph: 'home_approved_final.svg', label: 'Home', accessibleLabel: 'Home' },
  { tab: 'settings', glyph: 'settings_approved_final.svg', label: 'Settings', accessibleLabel: 'Settings' },
  { tab: 'profile', glyph: 'profile_approved_final.svg', label: 'Profile', accessibleLabel: 'Profile' },
];

export interface GameBottomNavProps {
  activeTab: NavTab | null;
  disabled?: boolean;
  onHomeClick?: () => void;
  onRulesClick?: () => void;
  onSettingsClick?: () => void;
  onLeaderboardClick?: () => void;
  onProfileClick?: () => void;
  onStoreClick?: () => void;
  children?: React.ReactNode;
}

export default function GameBottomNav({
  activeTab,
  disabled = false,
  onHomeClick,
  onRulesClick,
  onSettingsClick,
  onLeaderboardClick,
  onProfileClick,
  onStoreClick,
  children,
}: GameBottomNavProps) {
  const refined = useRefinedGameChrome();
  const [moreOpen, setMoreOpen] = useState(false);
  const navBarSrc = `${BASE}/assets/updated_nav_fab_bar/bottom_nav_shell_final.svg`;
  const handlers: Record<NavTab, (() => void) | undefined> = {
    home: onHomeClick,
    rules: onRulesClick,
    settings: onSettingsClick,
    leaderboard: onLeaderboardClick,
    profile: onProfileClick,
    store: onStoreClick,
  };

  useEffect(() => {
    if (!moreOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [moreOpen]);

  function openDestination(tab: NavTab) {
    setMoreOpen(false);
    handlers[tab]?.();
  }

  const items = refined ? REFINED_ITEMS : CONTROL_ITEMS;
  const moreIsActive = activeTab === 'rules' || activeTab === 'leaderboard' || activeTab === 'store';

  return (
    <>
      <nav className={`game-bottom-nav nav-bar${refined ? ' game-bottom-nav--refined-architecture' : ''}`} aria-label="Main navigation">
        <img className="game-bottom-nav__shell" src={navBarSrc} alt="" aria-hidden="true" draggable={false} />
        {refined && moreOpen && createPortal(
          <>
            <div
              className="game-bottom-nav__more-backdrop"
              role="presentation"
              onPointerDown={() => setMoreOpen(false)}
            />
            <div
              className="game-bottom-nav__more-menu"
              id="game-navigation-more"
              role="menu"
              aria-label="More destinations"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button type="button" role="menuitem" onClick={() => openDestination('rules')}>
                <img src={`${BASE}/assets/updated_nav_fab_bar/rules_approved_final.svg`} alt="" aria-hidden="true" />
                <span>Rules</span>
              </button>
              <button type="button" role="menuitem" onClick={() => openDestination('leaderboard')}>
                <img src={`${BASE}/assets/updated_nav_fab_bar/leaderboard_approved_final.svg`} alt="" aria-hidden="true" />
                <span>Board</span>
              </button>
              <button type="button" role="menuitem" onClick={() => openDestination('store')}>
                <img src={`${BASE}/assets/icons/shop.svg`} alt="" aria-hidden="true" />
                <span>Store</span>
              </button>
            </div>
          </>,
          document.body,
        )}
        <div className="game-bottom-nav__items">
          {items.map(({ tab, glyph, label, accessibleLabel }) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                className={`game-bottom-nav__item${isActive ? ' game-bottom-nav__item--active' : ''}`}
                aria-label={accessibleLabel}
                aria-current={isActive ? 'page' : undefined}
                disabled={disabled}
                onClick={handlers[tab]}
              >
                <img className="game-bottom-nav__glyph" src={`${BASE}/assets/updated_nav_fab_bar/${glyph}`} alt="" aria-hidden="true" draggable={false} />
                <span className="game-bottom-nav__label">{label}</span>
              </button>
            );
          })}
          {refined && (
            <button
              type="button"
              className={`game-bottom-nav__item game-bottom-nav__item--more${moreIsActive ? ' game-bottom-nav__item--active' : ''}`}
              aria-label="More"
              aria-expanded={moreOpen}
              aria-controls="game-navigation-more"
              aria-current={moreIsActive ? 'page' : undefined}
              disabled={disabled}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <img className="game-bottom-nav__glyph" src={`${BASE}/assets/updated_nav_fab_bar/rules_approved_final.svg`} alt="" aria-hidden="true" draggable={false} />
              <span className="game-bottom-nav__label">More</span>
            </button>
          )}
        </div>
      </nav>
      {children}
    </>
  );
}
