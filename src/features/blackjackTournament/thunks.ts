/**
 * Thunk: resolveBlackjackTournamentOutcome
 *
 * Reads the completed Blackjack Tournament state, validates the current game
 * phase matches the competition type, and awards LOH or POS via
 * `applyMinigameWinner`.
 *
 * Mirrors the resolveBiographyBlitzOutcome pattern:
 *  - Idempotent: no-op if outcomeResolved is already true.
 *  - Phase-guarded: logs an error and returns if the game phase does not match
 *    the competition type (prevents accidental cross-phase dispatch).
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markBlackjackTournamentOutcomeResolved } from './blackjackTournamentSlice';
import type { BlackjackTournamentState } from './blackjackTournamentSlice';

export const resolveBlackjackTournamentOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const bt = (s as RootState & { blackjackTournament?: BlackjackTournamentState })
      .blackjackTournament;
    if (!bt || bt.phase !== 'complete') return;

    // Idempotency guard.
    if (bt.outcomeResolved) {
      console.log(
        '[blackjackTournament] resolveBlackjackTournamentOutcome: already resolved, skipping.',
      );
      return;
    }

    const winnerId = bt.winnerId;
    if (!winnerId) return;

    const phase = s.game.phase;

    console.log('[blackjackTournament] resolveBlackjackTournamentOutcome start', {
      winnerId,
      competitionType: bt.competitionType,
      phase,
    });

    if (bt.competitionType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[blackjackTournament] resolveBlackjackTournamentOutcome: expected "loh_comp" for LOH, got',
        phase,
      );
      return;
    }
    if (bt.competitionType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[blackjackTournament] resolveBlackjackTournamentOutcome: expected "pos_comp" for POS, got',
        phase,
      );
      return;
    }

    // Mark resolved before dispatching so any synchronous re-render triggered
    // by applyMinigameWinner sees outcomeResolved = true.
    dispatch(markBlackjackTournamentOutcomeResolved());
    // The first player in eliminatedPlayerIds was the first eliminated (worst finisher).
    // Pass them as lastPlaceId so the third-nominee auto-add matches the elimination
    // order shown in the competition UI.
    const lastPlaceId = bt.eliminatedPlayerIds[0] ?? null;
    dispatch(applyMinigameWinner({ winnerId, lastPlaceId, lastPlaceType: 'survival' }));
  };
