/**
 * Thunk: resolveCompetitionOutcome
 *
 * Reads the completed CWGO competition state, validates the current game phase
 * matches the prize type, and awards LOH or POS via `applyMinigameWinner`.
 *
 * This thunk is idempotent — if it has already been resolved (outcomeResolved
 * is true) it returns immediately without dispatching again.
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markCwgoOutcomeResolved } from './cwgoCompetitionSlice';
import type { CwgoState } from './cwgoCompetitionSlice';

export const resolveCompetitionOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const cwgo = (s as RootState & { cwgo?: CwgoState }).cwgo;
    if (!cwgo || cwgo.status !== 'complete') return;

    // Idempotency guard: outcome already resolved — do not dispatch again.
    if (cwgo.outcomeResolved) {
      console.log('[cwgo] resolveCompetitionOutcome: already resolved, skipping.');
      return;
    }

    const champ = cwgo.aliveIds[0];
    if (!champ) return;

    const phase = s.game.phase;

    console.log('[cwgo] resolveCompetitionOutcome start', {
      champ,
      prizeType: cwgo.prizeType,
      phase,
    });

    // Validate game phase matches prize type before dispatching.
    if (cwgo.prizeType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[cwgo] resolveCompetitionOutcome: expected phase "loh_comp" for LOH prize, got',
        phase,
      );
      return;
    }
    if (cwgo.prizeType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[cwgo] resolveCompetitionOutcome: expected phase "pos_comp" for POS prize, got',
        phase,
      );
      return;
    }

    // Mark as resolved before dispatching so any synchronous re-render triggered
    // by applyMinigameWinner sees outcomeResolved = true and cannot re-enter.
    dispatch(markCwgoOutcomeResolved());

    // applyMinigameWinner uses the current game phase (loh_comp → applyLohWinner,
    // pos_comp → applyPosWinner) to apply the appropriate winner effect.
    // Pass the first-eliminated player as lastPlaceId so the third-nominee
    // auto-add matches the elimination order shown in the competition UI.
    const lastPlaceId = cwgo.eliminationOrder[0] ?? null;
    dispatch(applyMinigameWinner({ winnerId: champ, lastPlaceId, lastPlaceType: 'survival' }));
  };
