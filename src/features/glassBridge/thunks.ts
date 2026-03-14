/**
 * Thunk: resolveGlassBridgeOutcome
 *
 * Reads the completed Glass Bridge state, validates the current game phase
 * matches the competition type, and awards HOH or POV via `applyMinigameWinner`.
 *
 * Idempotent — returns immediately if outcomeResolved is already true.
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markGlassBridgeOutcomeResolved } from './glassBridgeSlice';
import type { GlassBridgeState } from './glassBridgeSlice';

export const resolveGlassBridgeOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const gb = (s as RootState & { glassBridge?: GlassBridgeState }).glassBridge;
    if (!gb || gb.phase !== 'complete') return;

    if (gb.outcomeResolved) {
      console.log('[glassBridge] resolveGlassBridgeOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = gb.winnerId;
    if (!winnerId) return;

    const phase = s.game.phase;

    console.log('[glassBridge] resolveGlassBridgeOutcome start', {
      winnerId,
      competitionType: gb.competitionType,
      phase,
    });

    if (gb.competitionType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[glassBridge] resolveGlassBridgeOutcome: expected phase "hoh_comp" for HOH, got',
        phase,
      );
      return;
    }
    if (gb.competitionType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[glassBridge] resolveGlassBridgeOutcome: expected phase "pov_comp" for POV, got',
        phase,
      );
      return;
    }

    dispatch(markGlassBridgeOutcomeResolved());
    dispatch(applyMinigameWinner({ winnerId }));
  };
