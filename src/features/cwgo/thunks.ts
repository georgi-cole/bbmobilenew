/**
 * Thunk: resolveCompetitionOutcome
 *
 * Reads the completed CWGO competition state, validates the current game phase
 * matches the prize type, and awards HOH or POV via `applyMinigameWinner`.
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
    if (cwgo.prizeType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[cwgo] resolveCompetitionOutcome: expected phase "hoh_comp" for HOH prize, got',
        phase,
      );
      return;
    }
    if (cwgo.prizeType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[cwgo] resolveCompetitionOutcome: expected phase "pov_comp" for POV prize, got',
        phase,
      );
      return;
    }

    // Mark as resolved before dispatching so any synchronous re-render triggered
    // by applyMinigameWinner sees outcomeResolved = true and cannot re-enter.
    dispatch(markCwgoOutcomeResolved());

    // applyMinigameWinner uses the current game phase (hoh_comp → applyHohWinner,
    // pov_comp → applyPovWinner) to apply the appropriate winner effect.
    dispatch(applyMinigameWinner({ winnerId: champ }));
  };
