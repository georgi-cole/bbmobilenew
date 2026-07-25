import type { ReactNode } from 'react';

import './MinigameUtilityDock.css';

export type MinigameUtilityPhase = 'rules' | 'countdown' | 'playing' | 'results';

interface Props {
  phase: MinigameUtilityPhase;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onOpenRules: () => void;
  onRequestExit: () => void;
}

function EyeIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.7 12s3.3-5.4 9.3-5.4 9.3 5.4 9.3 5.4-3.3 5.4-9.3 5.4S2.7 12 2.7 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      <circle className="minigame-utility-dock__eye-glint" cx="13" cy="11" r="0.8" />
    </svg>
  );
}

function RulesIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 4.5h6.1c1.1 0 2 .9 2 2v13H7a2 2 0 0 1-2-2v-13Z" />
      <path d="M19 4.5h-5.9v15H17a2 2 0 0 0 2-2v-13Z" />
      <path d="M8 8h2.2M8 11h2.2M15.2 8H17M15.2 11H17" />
    </svg>
  );
}

function ExitIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M13 4.5H6.8A1.8 1.8 0 0 0 5 6.3v11.4a1.8 1.8 0 0 0 1.8 1.8H13" />
      <path d="M10.5 12h9M16.5 8.5 20 12l-3.5 3.5" />
    </svg>
  );
}

export default function MinigameUtilityDock({
  phase,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpenRules,
  onRequestExit,
}: Props) {
  const rulesAvailable = phase === 'countdown' || phase === 'playing';

  return (
    <>
      {menuOpen && (
        <button
          type="button"
          className="minigame-utility-dock__backdrop"
          aria-label="Dismiss minigame options"
          onClick={onCloseMenu}
          tabIndex={-1}
        />
      )}

      <div className={`minigame-utility-dock ${menuOpen ? 'minigame-utility-dock--open' : ''}`}>
        {menuOpen && (
          <div
            id="minigame-utility-menu"
            className="minigame-utility-dock__menu"
            role="menu"
            aria-label="Minigame options"
          >
            {rulesAvailable && (
              <button
                type="button"
                className="minigame-utility-dock__menu-item"
                role="menuitem"
                onClick={onOpenRules}
              >
                <span className="minigame-utility-dock__menu-icon"><RulesIcon /></span>
                <span>
                  <strong>View rules</strong>
                  <small>Review how to play</small>
                </span>
              </button>
            )}

            <button
              type="button"
              className="minigame-utility-dock__menu-item minigame-utility-dock__menu-item--exit"
              role="menuitem"
              onClick={onRequestExit}
            >
              <span className="minigame-utility-dock__menu-icon"><ExitIcon /></span>
              <span>
                <strong>Leave competition</strong>
                <small>Record a score of 0</small>
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          className="minigame-utility-dock__orb"
          aria-label={menuOpen ? 'Close minigame menu' : 'Open minigame menu'}
          aria-expanded={menuOpen}
          aria-controls="minigame-utility-menu"
          onClick={onToggleMenu}
        >
          <EyeIcon />
        </button>
      </div>
    </>
  );
}
