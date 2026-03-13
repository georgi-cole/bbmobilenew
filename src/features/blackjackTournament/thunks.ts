/**
 * Thunk: resolveBlackjackTournamentOutcome
 *
 * Reads the completed Blackjack Tournament state, validates the current game
 * phase matches the competition type, and awards HOH or POV via
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

    if (bt.competitionType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[blackjackTournament] resolveBlackjackTournamentOutcome: expected "hoh_comp" for HOH, got',
        phase,
      );
      return;
    }
    if (bt.competitionType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[blackjackTournament] resolveBlackjackTournamentOutcome: expected "pov_comp" for POV, got',
        phase,
      );
      return;
    }

    // Mark resolved before dispatching so any synchronous re-render triggered
    // by applyMinigameWinner sees outcomeResolved = true.
    dispatch(markBlackjackTournamentOutcomeResolved());
    dispatch(applyMinigameWinner({ winnerId }));
  };
