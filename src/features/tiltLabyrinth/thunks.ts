/**
 * Thunk: resolveTiltLabyrinthOutcome
 *
 * Reads the completed Tilt Labyrinth competition state, validates the current game phase
 * matches the competition type, and awards LOH or POS via `applyMinigameWinner`.
 *
 * Idempotent — returns immediately if outcomeResolved is already true.
 * Phase-guarded — logs an error and returns if the game phase doesn't match.
 * Sets outcomeResolved BEFORE dispatching applyMinigameWinner so any synchronous
 * re-render triggered by the winner dispatch sees the guard.
 *
 * Scoring: lower-is-better (completion time in ms). Last place = highest time.
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markTiltLabyrinthOutcomeResolved } from './tiltLabyrinthSlice';
import type { TiltLabyrinthState } from './tiltLabyrinthSlice';

export const resolveTiltLabyrinthOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const tiltLabyrinth = (s as RootState & { tiltLabyrinth?: TiltLabyrinthState }).tiltLabyrinth;
    if (!tiltLabyrinth || tiltLabyrinth.phase !== 'complete') return;

    if (tiltLabyrinth.outcomeResolved) {
      console.log('[tiltLabyrinth] resolveTiltLabyrinthOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = tiltLabyrinth.winnerId;
    if (!winnerId) {
      console.warn('[tiltLabyrinth] resolveTiltLabyrinthOutcome: no winnerId, cannot resolve.');
      return;
    }

    const phase = s.game.phase;

    console.log('[tiltLabyrinth] resolveTiltLabyrinthOutcome start', {
      winnerId,
      lastPlaceId: tiltLabyrinth.lastPlaceId,
      competitionType: tiltLabyrinth.competitionType,
      phase,
    });

    if (tiltLabyrinth.competitionType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[tiltLabyrinth] resolveTiltLabyrinthOutcome: expected phase "loh_comp" for LOH, got',
        phase,
      );
      return;
    }
    if (tiltLabyrinth.competitionType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[tiltLabyrinth] resolveTiltLabyrinthOutcome: expected phase "pos_comp" for POS, got',
        phase,
      );
      return;
    }

    // Mark resolved BEFORE dispatching applyMinigameWinner so the guard is set
    // before any synchronous re-render triggered by the winner dispatch.
    dispatch(markTiltLabyrinthOutcomeResolved());

    dispatch(
      applyMinigameWinner({
        winnerId,
        lastPlaceId: tiltLabyrinth.lastPlaceId ?? undefined,
        lastPlaceType: 'scored',
        scores: tiltLabyrinth.finalScores,
        participants: tiltLabyrinth.participants.map((p) => p.id),
      }),
    );
  };
