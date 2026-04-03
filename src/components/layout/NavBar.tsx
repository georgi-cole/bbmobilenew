import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import './NavBar.css';
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { resetGame } from '../../store/gameSlice';
import GameBottomNav, { type NavTab } from '../GameBottomNav/GameBottomNav';

/**
 * NavBar — bottom tab bar.
 *
 * Preserves all routing and game-exit confirmation logic.
 * Visual layer is now delegated to GameBottomNav.
 */
export default function NavBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // Heuristic: treat the game as "active/in-progress" when either we're past
  // week 1 or the phase is not the initial 'week_start'. This mirrors the
  // gameInProgress logic used elsewhere (e.g. in Settings).
  const isGameActive = useAppSelector(
    (s) => s.game.week > 1 || s.game.phase !== 'week_start',
  );

  const [confirmOpen, setConfirmOpen] = useState(false);

  if (pathname === '/' || pathname.startsWith('/credits')) return null;

  function handleHomeClick() {
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

  // Derive the active tab from the current pathname.
  function getActiveTab(): NavTab | null {
    if (pathname.startsWith('/rules'))       return 'rules';
    if (pathname.startsWith('/settings'))    return 'settings';
    if (pathname.startsWith('/leaderboard')) return 'leaderboard';
    if (pathname.startsWith('/profile'))     return 'profile';
    return null;
  }

  return (
    <GameBottomNav
      activeTab={getActiveTab()}
      onHomeClick={handleHomeClick}
      onRulesClick={() => navigate('/rules')}
      onSettingsClick={() => navigate('/settings')}
      onLeaderboardClick={() => navigate('/leaderboard')}
      onProfileClick={() => navigate('/profile')}
    >
      <ConfirmExitModal
        open={confirmOpen}
        title="You are about to exit the house"
        description="Exiting now will reset the current game. All scores and achievements for this season will be lost."
        confirmLabel="Exit"
        cancelLabel="Stay"
        onConfirm={onConfirmExit}
        onCancel={() => setConfirmOpen(false)}
      />
    </GameBottomNav>
  );
}
