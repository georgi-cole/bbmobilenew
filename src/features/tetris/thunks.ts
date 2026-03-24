/**
 * Thunk: resolveTetrisOutcome
 *
 * Reads the completed Tetris competition state, validates the current game phase
 * matches the competition type, and awards HOH or POV via `applyMinigameWinner`.
 *
 * Idempotent — returns immediately if outcomeResolved is already true.
 * Phase-guarded — logs an error and returns if the game phase doesn't match.
 * Sets outcomeResolved BEFORE dispatching applyMinigameWinner so any synchronous
 * re-render triggered by the winner dispatch sees the guard.
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markTetrisOutcomeResolved } from './tetrisSlice';
import type { TetrisState } from './tetrisSlice';

export const resolveTetrisOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const tetris = (s as RootState & { tetris?: TetrisState }).tetris;
    if (!tetris || tetris.phase !== 'complete') return;

    if (tetris.outcomeResolved) {
      console.log('[tetris] resolveTetrisOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = tetris.winnerId;
    if (!winnerId) {
      console.warn('[tetris] resolveTetrisOutcome: no winnerId, cannot resolve.');
      return;
    }

    const phase = s.game.phase;

    console.log('[tetris] resolveTetrisOutcome start', {
      winnerId,
      lastPlaceId: tetris.lastPlaceId,
      competitionType: tetris.competitionType,
      phase,
    });

    if (tetris.competitionType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[tetris] resolveTetrisOutcome: expected phase "hoh_comp" for HOH, got',
        phase,
      );
      return;
    }
    if (tetris.competitionType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[tetris] resolveTetrisOutcome: expected phase "pov_comp" for POV, got',
        phase,
      );
      return;
    }

    // Mark resolved BEFORE dispatching applyMinigameWinner so the guard is set
    // before any synchronous re-render triggered by the winner dispatch.
    dispatch(markTetrisOutcomeResolved());

    dispatch(
      applyMinigameWinner({
        winnerId,
        lastPlaceId: tetris.lastPlaceId ?? undefined,
        lastPlaceType: 'scored',
        scores: tetris.finalScores,
        participants: tetris.participants.map((p) => p.id),
      }),
    );
  };
