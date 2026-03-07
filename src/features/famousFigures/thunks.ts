/**
 * Thunk: resolveFamousFiguresOutcome
 *
 * Reads the completed Famous Figures competition state, validates the current
 * game phase matches the competition type, and awards HOH or POV via
 * `applyMinigameWinner`.
 *
 * Idempotent — if outcomeResolved is already true it returns immediately
 * without dispatching again. Mirrors the biographyBlitz/thunks.ts pattern.
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markFamousFiguresOutcomeResolved } from './famousFiguresSlice';
import type { FamousFiguresState } from './famousFiguresSlice';

export const resolveFamousFiguresOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const ff = (s as RootState & { famousFigures?: FamousFiguresState }).famousFigures;
    if (!ff || ff.status !== 'complete') return;

    // Idempotency guard
    if (ff.outcomeResolved) {
      console.log('[famousFigures] resolveFamousFiguresOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = ff.winnerId;
    if (!winnerId) return;

    const phase = s.game.phase;

    console.log('[famousFigures] resolveFamousFiguresOutcome start', {
      winnerId,
      competitionType: ff.competitionType,
      phase,
    });

    if (ff.competitionType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[famousFigures] resolveFamousFiguresOutcome: expected phase "hoh_comp" for HOH, got',
        phase,
      );
      return;
    }
    if (ff.competitionType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[famousFigures] resolveFamousFiguresOutcome: expected phase "pov_comp" for POV, got',
        phase,
      );
      return;
    }

    dispatch(markFamousFiguresOutcomeResolved());
    dispatch(applyMinigameWinner(winnerId));
  };
