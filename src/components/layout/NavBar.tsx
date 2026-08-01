import { useLocation, useNavigate } from 'react-router';
import { useState } from 'react';
import { useStore } from 'react-redux';
import './NavBar.css';
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal';
import SurvivorRulesModal from '../ConfirmExitModal/SurvivorRulesModal';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { resetGame } from '../../store/gameSlice';
import { selectPendingChallenge } from '../../store/challengeSlice';
import { selectMusicScene } from '../../store/uiSlice';
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
  const isMainGameRoute = pathname === '/game';
  const isGameOverRoute = pathname.startsWith('/game-over');
  // The homebar should appear as soon as a run is launched from IntroHub, so
  // we key visibility off the run state that resetGame/hydrateGame now mark
  // active immediately.
  const isGameActive = useAppSelector((s) => s.game.status === 'active');
  const gameMode = useAppSelector((s) => s.game.mode);
  const pendingChallenge = useAppSelector(selectPendingChallenge);
  const pendingMinigame = useAppSelector((s) => s.game.pendingMinigame);
  const humanPlayer = useAppSelector((s) => s.game.players.find((player) => player.isUser));
  const gamePhase = useAppSelector((s) => s.game.phase);
  const seasonFinale = useAppSelector((s) => s.game.seasonFinale);
  const battleBack = useAppSelector((s) => s.game.battleBack);
  const favoritePlayer = useAppSelector((s) => s.game.favoritePlayer);
  const musicScene = useAppSelector(selectMusicScene);
  const activeProfileId = useAppSelector((s) => s.profiles.activeProfileId);
  const isGuest = useAppSelector((s) => s.profiles.isGuest);
  const canPersistActiveRun = !isGuest && Boolean(activeProfileId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [survivalRulesOpen, setSurvivalRulesOpen] = useState(false);
  const isVoxPopuli = useAppSelector((s) => s.game.voxPopuli?.status === 'active');
  const humanInPendingChallenge =
    Boolean(pendingChallenge && humanPlayer && pendingChallenge.participants.includes(humanPlayer.id));
  const humanInPendingMinigame =
    Boolean(pendingMinigame && humanPlayer && pendingMinigame.participants.includes(humanPlayer.id));
  const isFullScreenFlowActive =
    humanInPendingChallenge ||
    humanInPendingMinigame ||
    gamePhase === 'jury' ||
    gamePhase === 'jury_announcement' ||
    gamePhase === 'jury_cinematic' ||
    Boolean(seasonFinale) ||
    musicScene !== 'none' ||
    Boolean(battleBack?.competitionActive) ||
    Boolean(favoritePlayer?.votingStarted);

  if (!isMainGameRoute && !isGameOverRoute) return null;
  if (!isGameActive && !isGameOverRoute) return null;
  if (!isGameOverRoute && isFullScreenFlowActive) return null;

  function handleHomeClick() {
    if (!isGameActive) {
      navigate('/');
      return;
    }
    setSaveError(false);
    setConfirmOpen(true);
  }

  function handleRulesClick() {
    if (gameMode === 'survival') {
      setSurvivalRulesOpen(true);
      return;
    }
    if (isVoxPopuli) {
      navigate('/vox-populi-rules');
      return;
    }
    navigate('/rules');
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
    if (saveActiveRun()) {
      returnHome();
      return;
    }
    setSaveError(true);
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

  const modalTitle = saveError
    ? 'Progress was not saved'
    : canPersistActiveRun ? 'Save and return home?' : 'Leave this season?';
  const modalDescription = saveError
    ? 'Your season is still open. Free some browser storage and try again.'
    : canPersistActiveRun
      ? 'We will save your current week before returning to the Home hub.'
      : 'Guest seasons cannot be saved. Leaving will discard this run.';

  return (
    <GameBottomNav
      activeTab={getActiveTab()}
      disabled={isGameOverRoute}
      onHomeClick={handleHomeClick}
      onRulesClick={handleRulesClick}
      onSettingsClick={() => navigate('/settings')}
      onLeaderboardClick={() => navigate('/leaderboard')}
      onProfileClick={() => navigate('/profile', { state: { from: '/game' } })}
      onStoreClick={() => navigate('/', { state: { openHubUtility: 'store' } })}
    >
      <ConfirmExitModal
        open={confirmOpen}
        title={modalTitle}
        description={modalDescription}
        confirmLabel={canPersistActiveRun ? (saveError ? 'Try saving again' : 'Save & Home') : 'Quit without saving'}
        secondaryLabel={canPersistActiveRun ? 'Quit without saving' : undefined}
        cancelLabel="Cancel"
        onConfirm={canPersistActiveRun ? saveThenReturnHome : quitWithoutSaving}
        onSecondary={canPersistActiveRun ? quitWithoutSaving : undefined}
        onCancel={() => setConfirmOpen(false)}
      />
      <SurvivorRulesModal
        open={survivalRulesOpen}
        variant="reference"
        onCancel={() => setSurvivalRulesOpen(false)}
      />
    </GameBottomNav>
  );
}
