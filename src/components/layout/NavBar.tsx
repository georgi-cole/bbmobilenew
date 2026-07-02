import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from 'react-redux';
import './NavBar.css';
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { resetGame } from '../../store/gameSlice';
import { saveRunSnapshot } from '../../store/saveStatePersistence';
import type { RootState } from '../../store/store';
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
  const reduxStore = useStore<RootState>();
  const isGameOverRoute = pathname.startsWith('/game-over');

  // Heuristic: treat the game as "active/in-progress" when either we're past
  // week 1 or the phase is not the initial 'week_start'. This mirrors the
  // gameInProgress logic used elsewhere (e.g. in Settings).
  const isGameActive = useAppSelector(
    (s) => s.game.week > 1 || s.game.phase !== 'week_start' || s.game.mode === 'survivor',
  );
  const activeProfileId = useAppSelector((s) => s.profiles.activeProfileId);
  const isGuest = useAppSelector((s) => s.profiles.isGuest);
  const canPersistActiveRun = !isGuest && Boolean(activeProfileId);

  const [confirmOpen, setConfirmOpen] = useState(false);

  if (pathname === '/' || pathname.startsWith('/credits')) return null;

  function handleHomeClick() {
    if (!isGameActive) {
      navigate('/');
      return;
    }
    setConfirmOpen(true);
  }

  function saveActiveRun(): boolean {
    if (!activeProfileId || isGuest) return false;
    const currentState = reduxStore.getState();
    return saveRunSnapshot(activeProfileId, {
      version: 1,
      profileId: activeProfileId,
      savedAt: new Date().toISOString(),
      game: {
        ...currentState.game,
        mode: currentState.game.mode ?? 'classic',
        lastPlayedAt: Date.now(),
        saveVersion: currentState.game.saveVersion ?? 2,
      },
      finale: currentState.finale,
      social: currentState.social,
    });
  }

  function returnHome() {
    setConfirmOpen(false);
    navigate('/');
  }

  function saveThenReturnHome() {
    saveActiveRun();
    returnHome();
  }

  function quitWithoutSaving() {
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

  const hasSavedRun = canPersistActiveRun;
  const modalTitle = hasSavedRun ? 'Return to Home hub?' : 'Unsaved progress';
  const modalDescription = hasSavedRun
    ? 'Your saved progress will be available when you come back.'
    : 'Save before returning home, or quit without saving.';

  return (
    <GameBottomNav
      activeTab={getActiveTab()}
      disabled={isGameOverRoute}
      onHomeClick={handleHomeClick}
      onRulesClick={() => navigate('/rules')}
      onSettingsClick={() => navigate('/settings')}
      onLeaderboardClick={() => navigate('/leaderboard')}
      onProfileClick={() => navigate('/profile')}
    >
      <ConfirmExitModal
        open={confirmOpen}
        title={modalTitle}
        description={modalDescription}
        confirmLabel={hasSavedRun ? 'Return Home' : 'Save first'}
        secondaryLabel={hasSavedRun ? undefined : 'Quit without saving'}
        cancelLabel="Cancel"
        onConfirm={hasSavedRun ? returnHome : saveThenReturnHome}
        onSecondary={hasSavedRun ? undefined : quitWithoutSaving}
        onCancel={() => setConfirmOpen(false)}
      />
    </GameBottomNav>
  );
}
