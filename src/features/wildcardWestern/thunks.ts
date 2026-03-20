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

    if (ww.prizeType === 'HOH' && phase !== 'hoh_comp') {
      if (import.meta.env.DEV) {
        console.error(
          '[wildcardWestern] resolveWildcardWesternOutcome: expected "hoh_comp" for HOH, got',
          phase,
        );
      }
      return;
    }
    if (ww.prizeType === 'POV' && phase !== 'pov_comp') {
      if (import.meta.env.DEV) {
        console.error(
          '[wildcardWestern] resolveWildcardWesternOutcome: expected "pov_comp" for POV, got',
          phase,
        );
      }
      return;
    }

    dispatch(markWildcardWesternOutcomeResolved());
    dispatch(applyMinigameWinner({ winnerId }));
  };
