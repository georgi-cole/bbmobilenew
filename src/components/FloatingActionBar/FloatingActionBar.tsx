import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from 'react-redux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { advance } from '../../store/gameSlice';
import {
  openIncomingInbox,
  openSocialPanel,
  selectEnergyBank,
  selectPendingIncomingInteractionCount,
} from '../../social/socialSlice';
import {
  selectAdvanceEnabled,
  selectIsWaitingForInput,
  selectHumanIsActive,
} from '../../store/selectors';
import {
  savedStateKeyForProfile,
  saveSeasonSnapshot,
} from '../../store/saveStatePersistence';
import type { RootState } from '../../store/store';
import './FloatingActionBar.css';

/**
 * FloatingActionBar — BitLife-style mobile FAB for the Game screen.
 *
 * Layout:
 *   [Social] [Help]  ●Next●  [Save] [Actions]
 *
 * - Center button dispatches advance(); pulses when actionable; disabled when
 *   waiting for human input (replacement nominee, Final 4 POV vote, Final 3 HOH eviction).
 * - Left side: Social and Help buttons (Help opens Rules).
 * - Right side: Save and Inbox buttons.
 *   - Save persists the current in-progress season snapshot.
 *     Disabled in guest mode, at game start, when no profile is selected,
 *     or while a competition/minigame is actively running.
 *   - Inbox shows pending incoming interaction badge count.
 */
export default function FloatingActionBar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const reduxStore = useStore<RootState>();
  const canAdvance = useAppSelector(selectAdvanceEnabled);
  const isWaiting = useAppSelector(selectIsWaitingForInput);
  const pendingCount = useAppSelector(selectPendingIncomingInteractionCount);
  const humanIsActive = useAppSelector(selectHumanIsActive);
  // Use optional chaining so tests that don't include the profiles reducer still work.
  const isGuest = useAppSelector((s) => (s as { profiles?: { isGuest?: boolean } }).profiles?.isGuest ?? false);
  const activeProfileId = useAppSelector((s) => (s as { profiles?: { activeProfileId?: string | null } }).profiles?.activeProfileId ?? null);
  // Disable Save while a competition/minigame is actively running to prevent
  // saving state that requires additional slices (cwgo, riskWheel, etc.) to resume correctly.
  const hasPendingChallenge = useAppSelector((s) => (s as { challenge?: { pending: unknown } }).challenge?.pending != null);
  const players = useAppSelector((s) => s.game.players);
  const energyBank = useAppSelector(selectEnergyBank);
  const gameWeek = useAppSelector((s) => s.game.week);
  const gamePhase = useAppSelector((s) => s.game.phase);

  const humanPlayer = players.find((p) => p.isUser);
  const humanEnergy = humanPlayer ? (energyBank?.[humanPlayer.id] ?? 0) : null;

  // Flash the social button whenever the human player's energy changes.
  const [isFlashing, setIsFlashing] = useState(false);
  const prevEnergyRef = useRef(humanEnergy);
  useEffect(() => {
    if (humanEnergy === null || humanEnergy === prevEnergyRef.current) {
      prevEnergyRef.current = humanEnergy;
      return;
    }
    prevEnergyRef.current = humanEnergy;
    // Defer to avoid synchronous setState inside an effect body.
    const flashOn = setTimeout(() => setIsFlashing(true), 0);
    const flashOff = setTimeout(() => setIsFlashing(false), 600);
    return () => {
      clearTimeout(flashOn);
      clearTimeout(flashOff);
    };
  }, [humanEnergy]);

  // Save-button feedback state: null | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<null | 'saved' | 'error'>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the feedback timer on unmount to avoid state updates on an unmounted component.
  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  // The Save button is disabled when:
  //  - Playing as guest (no persistence)
  //  - No active profile
  //  - Game is at its very first state (nothing meaningful to save)
  //  - A competition or minigame is actively running (partial state would be unrestorable)
  const isAtGameStart = gameWeek === 1 && gamePhase === 'week_start';
  const canSave = !isGuest && Boolean(activeProfileId) && !isAtGameStart && !hasPendingChallenge;

  function handleSave() {
    if (!canSave || !activeProfileId) return;

    const currentState = reduxStore.getState();
    const key = savedStateKeyForProfile(activeProfileId);
    const ok = saveSeasonSnapshot(key, {
      version: 1,
      profileId: activeProfileId,
      savedAt: new Date().toISOString(),
      game: currentState.game,
      finale: currentState.finale,
      social: currentState.social,
    });
    setSaveStatus(ok ? 'saved' : 'error');

    // Clear feedback after 2 seconds.
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus(null), 2000);
  }

  const saveBtnAriaLabel = isGuest
    ? 'Save (unavailable in guest mode)'
    : !activeProfileId
      ? 'Save (no active profile selected)'
      : hasPendingChallenge
        ? 'Save (unavailable during competition)'
        : isAtGameStart
          ? 'Save (nothing to save yet)'
          : saveStatus === 'saved'
            ? 'Saved!'
            : saveStatus === 'error'
              ? 'Save failed'
              : 'Save game';

  const saveBtnTitle = isGuest
    ? 'Save unavailable in guest mode'
    : !activeProfileId
      ? 'No active profile selected'
      : hasPendingChallenge
        ? 'Save unavailable during competition'
        : isAtGameStart
          ? 'Nothing to save yet'
          : saveStatus === 'saved'
            ? 'Saved!'
            : saveStatus === 'error'
              ? 'Save failed — try again'
              : 'Save game';

  return (
    <div className="fab" role="toolbar" aria-label="Game actions">
      {/* ── Left side: Social + Help ───────────────────────────────────── */}
      <div className="fab__side">
        <button
          className={`fab__side-btn${isFlashing ? ' fab__side-btn--flash' : ''}`}
          type="button"
          aria-label={`Social${humanEnergy !== null ? ` (energy: ${humanEnergy})` : ''}`}
          title={`Social${humanEnergy !== null ? ` (energy: ${humanEnergy})` : ''}`}
          disabled={!humanIsActive}
          onClick={() => dispatch(openSocialPanel())}
        >
          💬
          {humanEnergy !== null && (
            <span className="fab__badge" aria-hidden="true">
              {humanEnergy > 99 ? '99+' : humanEnergy}
            </span>
          )}
        </button>
        <button
          className="fab__side-btn"
          type="button"
          aria-label="Help"
          title="Help"
          onClick={() => navigate('/rules')}
        >
          ❓
        </button>
      </div>

      {/* ── Center: Next / Advance ─────────────────────────────────────── */}
      <button
        className={`fab__center-btn${canAdvance && !isWaiting ? ' fab__center-btn--pulse' : ''}${
          isWaiting ? ' fab__center-btn--disabled' : ''
        }`}
        type="button"
        aria-label="Advance to next phase"
        disabled={isWaiting}
        onClick={() => {
          dispatch(advance())
          try { window.dispatchEvent(new CustomEvent('ui:playPressed')) } catch { /* ignore */ }
        }}
      >
        ▶
      </button>

      {/* ── Right side: Save + Inbox ───────────────────────────────────── */}
      <div className="fab__side">
        <button
          className={`fab__side-btn${saveStatus === 'saved' ? ' fab__side-btn--flash' : ''}`}
          type="button"
          aria-label={saveBtnAriaLabel}
          title={saveBtnTitle}
          disabled={!canSave}
          onClick={handleSave}
        >
          {saveStatus === 'saved' ? '✅' : saveStatus === 'error' ? '❌' : '💾'}
        </button>
        <button
          className="fab__side-btn"
          type="button"
          aria-label={`Inbox${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}`}
          title="Inbox"
          disabled={!humanIsActive}
          onClick={() => dispatch(openIncomingInbox())}
        >
          📥
          {pendingCount > 0 && (
            <span className="fab__badge" aria-hidden="true">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
