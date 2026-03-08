/**
 * Thunk: resolveBiographyBlitzOutcome
 *
 * Reads the completed Biography Blitz competition state, validates the current
 * game phase matches the competition type, and awards HOH or POV via
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
    if (bb.competitionType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[biographyBlitz] resolveBiographyBlitzOutcome: expected phase "hoh_comp" for HOH, got',
        phase,
      );
      return;
    }
    if (bb.competitionType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[biographyBlitz] resolveBiographyBlitzOutcome: expected phase "pov_comp" for POV, got',
        phase,
      );
      return;
    }

    // Mark as resolved before dispatching so any synchronous re-render
    // triggered by applyMinigameWinner sees outcomeResolved = true.
    dispatch(markBiographyBlitzOutcomeResolved());
    dispatch(applyMinigameWinner(winnerId));
  };
