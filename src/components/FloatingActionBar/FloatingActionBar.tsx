import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { advance } from '../../store/gameSlice';
import {
  selectAdvanceEnabled,
  selectIsWaitingForInput,
  selectUnreadDrCount,
  selectPendingActionsCount,
} from '../../store/selectors';
import './FloatingActionBar.css';

/**
 * FloatingActionBar — BitLife-style mobile FAB for the Game screen.
 *
 * Layout:
 *   [Social] [Help]  ●Next●  [DR] [Actions]
 *
 * - Center button dispatches advance(); pulses when actionable; disabled when
 *   waiting for human input.
 * - DR and Actions buttons show numeric badges wired to store selectors.
 * - Left side: Social and Help buttons (currently no-op placeholders).
 * - Right side: DR and Actions buttons with badge counts.
 */
export default function FloatingActionBar() {
  const dispatch = useAppDispatch();
  const canAdvance = useAppSelector(selectAdvanceEnabled);
  const isWaiting = useAppSelector(selectIsWaitingForInput);
  const drCount = useAppSelector(selectUnreadDrCount);
  const actionsCount = useAppSelector(selectPendingActionsCount);

  return (
    <div className="fab" role="toolbar" aria-label="Game actions">
      {/* ── Left side: Social + Help ───────────────────────────────────── */}
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
        className={[
          'fab__center-btn',
          canAdvance && !isWaiting ? 'fab__center-btn--pulse' : '',
          isWaiting ? 'fab__center-btn--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        type="button"
        aria-label="Advance to next phase"
        disabled={isWaiting}
        onClick={() => {
          if (!isWaiting) dispatch(advance());
        }}
      >
        ▶
      </button>

      {/* ── Right side: DR + Actions ───────────────────────────────────── */}
      <div className="fab__side">
        <button
          className="fab__side-btn"
          type="button"
          aria-label={`Diary Room${drCount > 0 ? ` (${drCount} unread)` : ''}`}
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
          aria-label={`Actions${actionsCount > 0 ? ` (${actionsCount} pending)` : ''}`}
          title="Actions"
        >
          ⚡
          {actionsCount > 0 && (
            <span className="fab__badge" aria-hidden="true">
              {actionsCount > 99 ? '99+' : actionsCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
