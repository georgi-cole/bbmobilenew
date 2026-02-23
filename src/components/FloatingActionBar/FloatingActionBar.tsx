import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { advance } from '../../store/gameSlice';
import { openSocialPanel, selectEnergyBank } from '../../social/socialSlice';
import {
  selectAdvanceEnabled,
  selectIsWaitingForInput,
  selectUnreadDrCount,
  selectCurrentNomineesCount,
} from '../../store/selectors';
import './FloatingActionBar.css';

/**
 * FloatingActionBar — BitLife-style mobile FAB for the Game screen.
 *
 * Layout:
 *   [Social] [Help]  ●Next●  [DR] [Actions]
 *
 * - Center button dispatches advance(); pulses when actionable; disabled when
 *   waiting for human input (replacement nominee, Final 4 POV vote, Final 3 HOH eviction).
 * - DR and Actions buttons show numeric badges wired to store selectors.
 * - Left side: Social and Help buttons (UI placeholders — functionality TBD).
 * - Right side: DR and Actions buttons with badge counts.
 */
export default function FloatingActionBar() {
  const dispatch = useAppDispatch();
  const canAdvance = useAppSelector(selectAdvanceEnabled);
  const isWaiting = useAppSelector(selectIsWaitingForInput);
  const drCount = useAppSelector(selectUnreadDrCount);
  const nomineesCount = useAppSelector(selectCurrentNomineesCount);
  const players = useAppSelector((s) => s.game.players);
  const energyBank = useAppSelector(selectEnergyBank);

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

  return (
    <div className="fab" role="toolbar" aria-label="Game actions">
      {/* ── Left side: Social + Help (placeholders) ───────────────────── */}
      <div className="fab__side">
        <button
          className={`fab__side-btn${isFlashing ? ' fab__side-btn--flash' : ''}`}
          type="button"
          aria-label={`Social${humanEnergy !== null ? ` (energy: ${humanEnergy})` : ''}`}
          title={`Social${humanEnergy !== null ? ` (energy: ${humanEnergy})` : ''}`}
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
        onClick={() => dispatch(advance())}
      >
        ▶
      </button>

      {/* ── Right side: DR + Actions ───────────────────────────────────── */}
      <div className="fab__side">
        <button
          className="fab__side-btn"
          type="button"
          aria-label={`Diary Room${drCount > 0 ? ` (${Math.min(drCount, 99)}${drCount > 99 ? '+' : ''} entries)` : ''}`}
          title="Diary Room"
        >
          📓
          {drCount > 0 && (
            <span className="fab__badge" aria-hidden="true">
              {drCount > 99 ? '99+' : drCount}
            </span>
          )}
        </button>
        <button
          className="fab__side-btn"
          type="button"
          aria-label={`Actions${nomineesCount > 0 ? ` (${nomineesCount} nominee${nomineesCount !== 1 ? 's' : ''})` : ''}`}
          title="Actions"
        >
          ⚡
          {nomineesCount > 0 && (
            <span className="fab__badge" aria-hidden="true">
              {nomineesCount > 99 ? '99+' : nomineesCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

