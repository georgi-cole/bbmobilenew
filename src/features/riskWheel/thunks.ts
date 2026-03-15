/**
 * Thunk: resolveRiskWheelOutcome
 *
 * Reads the completed Risk Wheel state, validates the current game phase
 * matches the competition type, and awards HOH or POV via
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

    if (rw.competitionType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[riskWheel] resolveRiskWheelOutcome: expected "hoh_comp" for HOH, got',
        phase,
      );
      return;
    }
    if (rw.competitionType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[riskWheel] resolveRiskWheelOutcome: expected "pov_comp" for POV, got',
        phase,
      );
      return;
    }

    // Mark resolved before dispatching so any synchronous re-render triggered
    // by applyMinigameWinner sees outcomeResolved = true and cannot re-enter.
    dispatch(markRiskWheelOutcomeResolved());

    console.log('[riskWheel] resolveRiskWheelOutcome: dispatching applyMinigameWinner', {
      winnerId,
    });
    dispatch(applyMinigameWinner({ winnerId }));
  };
