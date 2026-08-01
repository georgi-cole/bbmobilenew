/**
 * Thunk: resolveHoldTheWallOutcome
 *
 * Reads the completed Hold the Wall competition state, validates the current
 * game phase matches the prize type, and awards LOH or POS via
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

    // Final 3 uses the same interactive component, but its result is applied by
    // the GameScreen's Final 3 callback.  Marking the game resolved here lets
    // that authoritative callback run without incorrectly awarding an LOH/POS.
    const isFinalThreeMinigame = /^final3_comp[123]_minigame$/.test(phase);
    if (isFinalThreeMinigame) {
      dispatch(markHoldTheWallOutcomeResolved());
      return;
    }

    // Validate game phase matches prize type before dispatching.
    if (htw.prizeType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[holdTheWall] resolveHoldTheWallOutcome: expected phase "loh_comp" for LOH prize, got',
        phase,
      );
      return;
    }
    if (htw.prizeType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[holdTheWall] resolveHoldTheWallOutcome: expected phase "pos_comp" for POS prize, got',
        phase,
      );
      return;
    }

    // Mark as resolved before dispatching so any synchronous re-render
    // triggered by applyMinigameWinner sees outcomeResolved = true.
    dispatch(markHoldTheWallOutcomeResolved());
    // The first player to drop off the wall is the worst finisher ("last place").
    // Pass them as lastPlaceId so the third-nominee auto-add matches the UI.
    const lastPlaceId = htw.droppedIds[0] ?? null;
    dispatch(applyMinigameWinner({ winnerId, lastPlaceId, lastPlaceType: 'survival' }));
  };
