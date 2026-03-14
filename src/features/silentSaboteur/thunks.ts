/**
 * Thunk: resolveSilentSaboteurOutcome
 *
 * Reads the completed Silent Saboteur state, validates the current
 * game phase matches the competition type, and awards HOH or POV via
 * `applyMinigameWinner`.
 *
 * This thunk is idempotent — if outcomeResolved is already true it returns
 * immediately without dispatching again (mirrors biographyBlitz/thunks.ts).
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markSilentSaboteurOutcomeResolved } from './silentSaboteurSlice';
import type { SilentSaboteurState } from './silentSaboteurSlice';

export const resolveSilentSaboteurOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const ss = (s as RootState & { silentSaboteur?: SilentSaboteurState }).silentSaboteur;
    if (!ss || ss.phase !== 'complete') return;

    // Idempotency guard: outcome already resolved — do not dispatch again.
    if (ss.outcomeResolved) {
      console.log('[silentSaboteur] resolveSilentSaboteurOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = ss.winnerId;
    if (!winnerId) return;

    const phase = s.game.phase;

    console.log('[silentSaboteur] resolveSilentSaboteurOutcome start', {
      winnerId,
      prizeType: ss.prizeType,
      phase,
    });

    // Validate game phase matches competition type before dispatching.
    if (ss.prizeType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[silentSaboteur] resolveSilentSaboteurOutcome: expected phase "hoh_comp" for HOH, got',
        phase,
      );
      return;
    }
    if (ss.prizeType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[silentSaboteur] resolveSilentSaboteurOutcome: expected phase "pov_comp" for POV, got',
        phase,
      );
      return;
    }

    // Mark as resolved before dispatching so any synchronous re-render
    // triggered by applyMinigameWinner sees outcomeResolved = true.
    dispatch(markSilentSaboteurOutcomeResolved());
    dispatch(applyMinigameWinner({ winnerId }));
  };
