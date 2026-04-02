/**
 * Thunk: resolveBiographyBlitzOutcome
 *
 * Reads the completed Biography Blitz competition state, validates the current
 * game phase matches the competition type, and awards LOH or POS via
 * `applyMinigameWinner`.
 *
 * This thunk is idempotent — if outcomeResolved is already true it returns
 * immediately without dispatching again (mirrors cwgo/thunks.ts pattern).
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markBiographyBlitzOutcomeResolved } from './biography_blitz_logic';
import type { BiographyBlitzState } from './biography_blitz_logic';

export const resolveBiographyBlitzOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const bb = (s as RootState & { biographyBlitz?: BiographyBlitzState }).biographyBlitz;
    if (!bb || bb.phase !== 'complete') return;

    // Idempotency guard: outcome already resolved — do not dispatch again.
    if (bb.outcomeResolved) {
      console.log('[biographyBlitz] resolveBiographyBlitzOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = bb.competitionWinnerId;
    if (!winnerId) return;

    const phase = s.game.phase;

    console.log('[biographyBlitz] resolveBiographyBlitzOutcome start', {
      winnerId,
      competitionType: bb.competitionType,
      phase,
    });

    // Validate game phase matches competition type before dispatching.
    if (bb.competitionType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[biographyBlitz] resolveBiographyBlitzOutcome: expected phase "loh_comp" for LOH, got',
        phase,
      );
      return;
    }
    if (bb.competitionType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[biographyBlitz] resolveBiographyBlitzOutcome: expected phase "pos_comp" for POS, got',
        phase,
      );
      return;
    }

    // Mark as resolved before dispatching so any synchronous re-render
    // triggered by applyMinigameWinner sees outcomeResolved = true.
    dispatch(markBiographyBlitzOutcomeResolved());
    // The first player in eliminatedContestantIds was the first eliminated (worst finisher).
    // Pass them as lastPlaceId so the third-nominee auto-add matches the elimination
    // order shown in the competition UI.
    const lastPlaceId = bb.eliminatedContestantIds[0] ?? null;
    dispatch(applyMinigameWinner({ winnerId, lastPlaceId, lastPlaceType: 'survival' }));
  };
