import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import './NavBar.css';
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { resetGame } from '../../store/gameSlice';

/**
 * NavBar — bottom tab bar.
 *
 * To add a tab: append an entry to LINKS.
 * Each entry needs: to (route path), icon (emoji), label (text).
 */
const LINKS = [
  { to: '/',          icon: '🏠', label: 'Home'        },
  { to: '/game',      icon: '🎮', label: 'Game'        },
  { to: '/settings',  icon: '⚙️', label: 'Settings'    },
  { to: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
  { to: '/profile',   icon: '👤', label: 'Profile'     },
] as const;

export default function NavBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // Heuristic: treat the game as "active/in-progress" when the game phase
  // is not the initial 'week_start'. Adjust to use a dedicated selector
  // if/when one exists in the store.
  const isGameActive = useAppSelector((s) => s.game.phase !== 'week_start');

  const [confirmOpen, setConfirmOpen] = useState(false);

  if (pathname === '/') return null;

  function handleHomeClick(e: React.MouseEvent) {
    e.preventDefault();
    if (!isGameActive) {
      navigate('/');
      return;
    }
    // Game in progress: open confirmation modal
    setConfirmOpen(true);
  }

  function onConfirmExit() {
    // Cancel the current game (non-destructive archive NOT performed).
    // This resets the in-progress game — pressing Play later will start a fresh season.
    dispatch(resetGame());
    setConfirmOpen(false);
    navigate('/');
  }

  return (
    <>
      <nav className="nav-bar" aria-label="Main navigation">
        {LINKS.map(({ to, icon, label }) => {
          if (to === '/') {
            // Render a button so we can intercept the click when the game is active.
            return (
              <button
                key={to}
                className={`nav-bar__item${pathname === '/' ? ' nav-bar__item--active' : ''}`}
                onClick={handleHomeClick}
                aria-label={label}
                type="button"
              >
                <span className="nav-bar__item-inner">
                  <span className="nav-bar__icon" aria-hidden="true">{icon}</span>
                  <span className="nav-bar__label">{label}</span>
                </span>
              </button>
            );
          }

          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-bar__item${isActive ? ' nav-bar__item--active' : ''}`
              }
              aria-label={label}
            >
              <span className="nav-bar__item-inner">
                <span className="nav-bar__icon" aria-hidden="true">{icon}</span>
                <span className="nav-bar__label">{label}</span>
              </span>
            </NavLink>
          );
        })}
      </nav>

      <ConfirmExitModal
        open={confirmOpen}
        title="You are about to exit the house"
        description="Exiting now will reset the current game. All scores and achievements for this season will be lost."
        confirmLabel="Exit"
        cancelLabel="Stay"
        onConfirm={onConfirmExit}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
