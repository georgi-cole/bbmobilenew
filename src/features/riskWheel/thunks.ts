/**
 * Thunk: resolveRiskWheelOutcome
 *
 * Reads the completed Risk Wheel state, validates the current game phase
 * matches the competition type, and awards LOH or POS via
 * `applyMinigameWinner`.
 *
 * Mirrors the resolveBlackjackTournamentOutcome pattern:
 *  - Idempotent: no-op if outcomeResolved is already true.
 *  - Phase-guarded: logs an error and returns if the game phase does not
 *    match the competition type (prevents accidental cross-phase dispatch).
 *  - Sets outcomeResolved BEFORE dispatching applyMinigameWinner so any
 *    synchronous re-render triggered by the winner dispatch sees the guard.
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markRiskWheelOutcomeResolved } from './riskWheelSlice';
import type { RiskWheelState } from './riskWheelSlice';

export const resolveRiskWheelOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const rw = (s as RootState & { riskWheel?: RiskWheelState }).riskWheel;
    if (!rw || rw.phase !== 'complete') return;

    // Idempotency guard: outcome already resolved — do not dispatch again.
    if (rw.outcomeResolved) {
      console.log('[riskWheel] resolveRiskWheelOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = rw.winnerId;
    if (!winnerId) return;

    const phase = s.game.phase;

    console.log('[riskWheel] resolveRiskWheelOutcome start', {
      winnerId,
      competitionType: rw.competitionType,
      phase,
    });

    if (rw.competitionType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[riskWheel] resolveRiskWheelOutcome: expected "loh_comp" for LOH, got',
        phase,
      );
      return;
    }
    if (rw.competitionType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[riskWheel] resolveRiskWheelOutcome: expected "pos_comp" for POS, got',
        phase,
      );
      return;
    }

    // Mark resolved before dispatching so any synchronous re-render triggered
    // by applyMinigameWinner sees outcomeResolved = true and cannot re-enter.
    dispatch(markRiskWheelOutcomeResolved());

    // The first player in eliminatedPlayerIds was the first eliminated (worst finisher).
    // Pass them as lastPlaceId so the third-nominee auto-add matches the elimination
    // order shown in the competition UI.
    const lastPlaceId = rw.eliminatedPlayerIds[0] ?? null;
    console.log('[riskWheel] resolveRiskWheelOutcome: dispatching applyMinigameWinner', {
      winnerId,
      lastPlaceId,
    });
    dispatch(applyMinigameWinner({ winnerId, lastPlaceId, lastPlaceType: 'survival' }));
  };