import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { advance } from '../../store/gameSlice';
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

  return (
    <div className="fab" role="toolbar" aria-label="Game actions">
      {/* ── Left side: Social + Help (placeholders) ───────────────────── */}
      <div className="fab__side">
        <button
          className="fab__side-btn"
          type="button"
          aria-label="Social"
          title="Social"
        >
          💬
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

