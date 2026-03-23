import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { advance } from '../../store/gameSlice';
import {
  openIncomingInbox,
  openSocialPanel,
  selectEnergyBank,
  selectPendingIncomingInteractionCount,
} from '../../social/socialSlice';
import { selectAllDirections } from '../../publicOpinion';
import {
  selectAdvanceEnabled,
  selectIsWaitingForInput,
  selectHumanIsActive,
} from '../../store/selectors';
import './FloatingActionBar.css';

/**
 * FloatingActionBar — BitLife-style mobile FAB for the Game screen.
 *
 * Layout:
 *   [Social] [Actions]  ●Play●  [Public Meter] [Diary Room]
 *
 * - Center button dispatches advance(); pulses when actionable; disabled when
 *   waiting for human input (replacement nominee, Final 4 POV vote, Final 3 HOH eviction).
 * - Left side: Social module + incoming social actions.
 * - Right side: Public Meter hook + Diary Room shortcut.
 */
export default function FloatingActionBar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const canAdvance = useAppSelector(selectAdvanceEnabled);
  const isWaiting = useAppSelector(selectIsWaitingForInput);
  const pendingCount = useAppSelector(selectPendingIncomingInteractionCount);
  const humanIsActive = useAppSelector(selectHumanIsActive);
  const players = useAppSelector((s) => s.game.players);
  const energyBank = useAppSelector(selectEnergyBank);
  const directions = useAppSelector(selectAllDirections);

  const humanPlayer = players.find((p) => p.isUser);
  const humanEnergy = humanPlayer ? (energyBank?.[humanPlayer.id] ?? 0) : null;
  const publicRequestCount = useMemo(
    () =>
      humanPlayer
        ? directions.filter(
          (direction) => direction.playerId === humanPlayer.id && direction.status === 'active',
        ).length
        : 0,
    [directions, humanPlayer],
  );

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

  return (
    <div className="fab" role="toolbar" aria-label="Game actions">
      {/* ── Left side: Social + incoming actions ───────────────────────── */}
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
          aria-label={`Social actions${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}`}
          title="Social actions"
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

      {/* ── Right side: Public Meter + Diary Room ──────────────────────── */}
      <div className="fab__side">
        <button
          className="fab__side-btn"
          type="button"
          aria-label={`Public meter${publicRequestCount > 0 ? ` (${publicRequestCount} active requests)` : ''}`}
          title="Public meter"
          onClick={() =>
            navigate(publicRequestCount > 0 ? '/public-meter?tab=requests' : '/public-meter')
          }
        >
          📊
          {publicRequestCount > 0 && (
            <span className="fab__badge" aria-hidden="true">
              {publicRequestCount > 99 ? '99+' : publicRequestCount}
            </span>
          )}
        </button>
        <button
          className="fab__side-btn"
          type="button"
          aria-label="Confessional"
          title="Confessional"
          onClick={() => navigate('/diary-room')}
        >
          🎤
        </button>
      </div>
    </div>
  );
}
