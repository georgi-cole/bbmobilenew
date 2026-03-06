/**
 * Thunk: resolveHoldTheWallOutcome
 *
 * Reads the completed Hold the Wall competition state, validates the current
 * game phase matches the prize type, and awards HOH or POV via
 * `applyMinigameWinner`.
 *
 * This thunk is idempotent — if outcomeResolved is already true it returns
 * immediately without dispatching again (mirrors cwgo/thunks.ts pattern).
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markHoldTheWallOutcomeResolved } from './holdTheWallSlice';
import type { HoldTheWallState } from './holdTheWallSlice';

export const resolveHoldTheWallOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const htw = (s as RootState & { holdTheWall?: HoldTheWallState }).holdTheWall;
    if (!htw || htw.status !== 'complete') return;

    // Idempotency guard: outcome already resolved — do not dispatch again.
    if (htw.outcomeResolved) {
      console.log('[holdTheWall] resolveHoldTheWallOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = htw.winnerId;
    if (!winnerId) return;

    const phase = s.game.phase;

    console.log('[holdTheWall] resolveHoldTheWallOutcome start', {
      winnerId,
      prizeType: htw.prizeType,
      phase,
    });

    // Validate game phase matches prize type before dispatching.
    if (htw.prizeType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[holdTheWall] resolveHoldTheWallOutcome: expected phase "hoh_comp" for HOH prize, got',
        phase,
      );
      return;
    }
    if (htw.prizeType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[holdTheWall] resolveHoldTheWallOutcome: expected phase "pov_comp" for POV prize, got',
        phase,
      );
      return;
    }

    // Mark as resolved before dispatching so any synchronous re-render
    // triggered by applyMinigameWinner sees outcomeResolved = true.
    dispatch(markHoldTheWallOutcomeResolved());
    dispatch(applyMinigameWinner(winnerId));
  };
