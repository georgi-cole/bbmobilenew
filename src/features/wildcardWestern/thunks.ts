/**
 * thunks.ts – Thunks for Wildcard Western.
 *
 * Mirrors the resolveSilentSaboteurOutcome / resolveRiskWheelOutcome pattern:
 * - Idempotent: no-op if outcomeResolved is already true.
 * - Phase-guarded: validates game phase matches prizeType.
 * - Sets outcomeResolved BEFORE dispatching applyMinigameWinner.
 */

import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markWildcardWesternOutcomeResolved } from './wildcardWesternSlice';
import type { WildcardWesternState } from './wildcardWesternSlice';

export const resolveWildcardWesternOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const ww = (s as RootState & { wildcardWestern?: WildcardWesternState }).wildcardWestern;
    if (!ww || (ww.phase !== 'complete' && ww.phase !== 'gameOver')) return;

    if (ww.outcomeResolved) {
      if (import.meta.env.DEV) {
        console.log('[wildcardWestern] resolveWildcardWesternOutcome: already resolved, skipping.');
      }
      return;
    }

    const winnerId = ww.winnerId;
    if (!winnerId) return;

    const phase = s.game.phase;

    if (import.meta.env.DEV) {
      console.log('[wildcardWestern] resolveWildcardWesternOutcome start', {
        winnerId,
        prizeType: ww.prizeType,
        phase,
      });
    }

    // Final 3 uses the Western game as a standalone challenge.  Its winner is
    // handed back to the Final 3 flow by the component callback, so do not try
    // to award the normal LOH/POS prize (or leave the game waiting forever).
    const isFinalThreeMinigame = /^final3_comp[123]_minigame$/.test(phase);
    if (isFinalThreeMinigame) {
      dispatch(markWildcardWesternOutcomeResolved());
      return;
    }

    if (ww.prizeType === 'LOH' && phase !== 'loh_comp') {
      if (import.meta.env.DEV) {
        console.error(
          '[wildcardWestern] resolveWildcardWesternOutcome: expected "loh_comp" for LOH, got',
          phase,
        );
      }
      return;
    }
    if (ww.prizeType === 'POS' && phase !== 'pos_comp') {
      if (import.meta.env.DEV) {
        console.error(
          '[wildcardWestern] resolveWildcardWesternOutcome: expected "pos_comp" for POS, got',
          phase,
        );
      }
      return;
    }

    dispatch(markWildcardWesternOutcomeResolved());
    // The first player in eliminatedIds was the first eliminated (worst finisher).
    // Pass them as lastPlaceId so the third-nominee auto-add matches the elimination
    // order shown in the competition UI.
    const lastPlaceId = ww.eliminatedIds[0] ?? null;
    dispatch(applyMinigameWinner({ winnerId, lastPlaceId, lastPlaceType: 'survival' }));
  };
