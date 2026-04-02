/**
 * Thunk: resolveMemoryColorsOutcome
 *
 * Reads the completed Memory Colors state, validates the current game phase
 * matches the competition type, and awards LOH or POS via `applyMinigameWinner`.
 *
 * This thunk is idempotent — if outcomeResolved is already true it returns
 * immediately without dispatching again (mirrors the pattern used by cwgo,
 * holdTheWall, biographyBlitz, riskWheel, etc.).
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markMemoryColorsOutcomeResolved } from './memoryColorsSlice';
import type { MemoryColorsState } from './memoryColorsSlice';

export const resolveMemoryColorsOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const mc = (s as RootState & { memoryColors?: MemoryColorsState }).memoryColors;
    if (!mc || mc.phase !== 'complete') return;

    // Idempotency guard: outcome already resolved — do not dispatch again.
    if (mc.outcomeResolved) {
      console.log('[memoryColors] resolveMemoryColorsOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = mc.winnerId;
    if (!winnerId) {
      console.warn('[memoryColors] resolveMemoryColorsOutcome: no winnerId, cannot resolve.');
      return;
    }

    const phase = s.game.phase;

    console.log('[memoryColors] resolveMemoryColorsOutcome start', {
      winnerId,
      lastPlaceId: mc.lastPlaceId,
      competitionType: mc.competitionType,
      phase,
    });

    if (mc.competitionType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[memoryColors] resolveMemoryColorsOutcome: expected "loh_comp" for LOH, got',
        phase,
      );
      return;
    }
    if (mc.competitionType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[memoryColors] resolveMemoryColorsOutcome: expected "pos_comp" for POS, got',
        phase,
      );
      return;
    }

    // Mark resolved before dispatching so any synchronous re-render triggered
    // by applyMinigameWinner sees outcomeResolved = true and cannot re-enter.
    dispatch(markMemoryColorsOutcomeResolved());

    // Build a scores map from per-player results so applyMinigameWinner can
    // derive last-place from scores if needed (also pass explicit lastPlaceId).
    const allResults = {
      ...mc.aiResults,
      ...(mc.humanPlayerId && mc.humanResult
        ? { [mc.humanPlayerId]: mc.humanResult }
        : {}),
    };
    const scores: Record<string, number> = {};
    for (const [id, result] of Object.entries(allResults)) {
      scores[id] = result.score;
    }

    console.log('[memoryColors] resolveMemoryColorsOutcome: dispatching applyMinigameWinner', {
      winnerId,
      lastPlaceId: mc.lastPlaceId,
    });

    dispatch(
      applyMinigameWinner({
        winnerId,
        participants: mc.participantIds,
        scores,
        lastPlaceId: mc.lastPlaceId,
        lastPlaceType: 'scored',
      }),
    );
  };
