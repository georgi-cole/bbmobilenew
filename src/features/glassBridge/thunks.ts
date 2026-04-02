/**
 * Thunk: resolveGlassBridgeOutcome
 *
 * Reads the completed Glass Bridge state, validates the current game phase
 * matches the competition type, and awards LOH or POS via `applyMinigameWinner`.
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

    if (gb.competitionType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[glassBridge] resolveGlassBridgeOutcome: expected phase "loh_comp" for LOH, got',
        phase,
      );
      return;
    }
    if (gb.competitionType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[glassBridge] resolveGlassBridgeOutcome: expected phase "pos_comp" for POS, got',
        phase,
      );
      return;
    }

    dispatch(markGlassBridgeOutcomeResolved());
    // The first player eliminated from the bridge is the worst finisher ("last place").
    // Pass them as lastPlaceId so the third-nominee auto-add matches the UI.
    const lastPlaceId = gb.eliminationOrder[0] ?? null;
    dispatch(applyMinigameWinner({ winnerId, lastPlaceId, lastPlaceType: 'survival' }));
  };
