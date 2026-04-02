/**
 * Thunk: resolveSilentSaboteurOutcome
 *
 * Reads the completed Silent Saboteur state, validates the current
 * game phase matches the competition type, and awards LOH or POS via
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
    if (ss.prizeType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[silentSaboteur] resolveSilentSaboteurOutcome: expected phase "loh_comp" for LOH, got',
        phase,
      );
      return;
    }
    if (ss.prizeType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[silentSaboteur] resolveSilentSaboteurOutcome: expected phase "pos_comp" for POS, got',
        phase,
      );
      return;
    }

    // Mark as resolved before dispatching so any synchronous re-render
    // triggered by applyMinigameWinner sees outcomeResolved = true.
    dispatch(markSilentSaboteurOutcomeResolved());
    // The first player in eliminatedIds was the first eliminated (worst finisher).
    // Pass them as lastPlaceId so the third-nominee auto-add matches the elimination
    // order shown in the competition UI.
    const lastPlaceId = ss.eliminatedIds[0] ?? null;
    dispatch(applyMinigameWinner({ winnerId, lastPlaceId, lastPlaceType: 'survival' }));
  };
