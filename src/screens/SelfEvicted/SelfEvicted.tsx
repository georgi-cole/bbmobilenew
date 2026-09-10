import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { resetGame } from '../../store/gameSlice';
import { selectActiveProfileId, selectIsGuest } from '../../store/profilesSlice';
import {
  savedStateKeyForProfile,
  clearSeasonSnapshot,
  clearSavedRun,
  getSavedRunSlot,
} from '../../store/saveStatePersistence';
import { withRunAutosaveSuspended } from '../../store/runAutosaveGate';
import { SoundManager } from '../../services/sound/SoundManager';
import './SelfEvicted.css';

const HOME_MUSIC_FADE_MS = 400;

/**
 * SelfEvicted — shown when the human player voluntarily self-evicts from
 * the Diary Room. Unlike GameOver, this screen does NOT archive the season
 * or assume the game has concluded; the player simply left mid-game.
 */
export default function SelfEvicted() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const playerName = useAppSelector(
    (s) => s.game.players.find((p) => p.isUser)?.name ?? 'Housemate',
  );
  const currentRunSlot = useAppSelector((s) => getSavedRunSlot(s.game));
  const activeProfileId = useAppSelector(selectActiveProfileId);
  const isGuest = useAppSelector(selectIsGuest);

  useEffect(() => {
    if (isGuest || !activeProfileId) return;
    // Self-eviction is terminal for this run. Clearing persistence immediately
    // also changes the autosave revision, so any queued pre-eviction snapshot
    // is rejected instead of recreating a Continue entry later.
    clearSavedRun(activeProfileId, currentRunSlot);
    clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId));
  }, [activeProfileId, currentRunSlot, isGuest]);

  function clearSelfEvictedRun() {
    if (isGuest || !activeProfileId) return;
    clearSavedRun(activeProfileId, currentRunSlot);
    clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId));
  }

  function resetRuntimeAndReturnHome() {
    void SoundManager.fadeOutMusic(HOME_MUSIC_FADE_MS);
    withRunAutosaveSuspended(() => dispatch(resetGame()));
    navigate('/');
  }

  function startNewSeason() {
    clearSelfEvictedRun();
    resetRuntimeAndReturnHome();
  }

  function exitToHome() {
    clearSelfEvictedRun();
    resetRuntimeAndReturnHome();
  }

  return (
    <div className="self-evicted-shell">
      <div className="self-evicted-card">
        <div className="self-evicted-icon">🚪</div>
        <h1 className="self-evicted-title">You Left the House</h1>
        <p className="self-evicted-name">{playerName}</p>
        <p className="self-evicted-message">
          You chose to self-evict from The Big Eye house. The game
          continues without you — but your story ends here.
        </p>
        <div className="self-evicted-actions">
          <button
            className="self-evicted-btn self-evicted-btn--primary"
            onClick={startNewSeason}
          >
            Start New Season
          </button>
          <button
            className="self-evicted-btn self-evicted-btn--ghost"
            onClick={exitToHome}
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
}
