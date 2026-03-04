/**
 * Thunk: resolveCompetitionOutcome
 *
 * Reads the completed CWGO competition state, validates the current game phase
 * matches the prize type, and awards HOH or POV via `applyMinigameWinner`.
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';

export const resolveCompetitionOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const cwgo = (s as RootState & { cwgo?: { status: string; aliveIds: string[]; prizeType: string } }).cwgo;
    if (!cwgo || cwgo.status !== 'complete') return;
    const champ = cwgo.aliveIds[0];
    if (!champ) return;

    const phase = s.game.phase;

    // Validate game phase matches prize type before dispatching.
    if (cwgo.prizeType === 'HOH' && phase !== 'hoh_comp') {
      console.error(
        '[cwgo] resolveCompetitionOutcome: expected phase "hoh_comp" for HOH prize, got',
        phase,
      );
      return;
    }
    if (cwgo.prizeType === 'POV' && phase !== 'pov_comp') {
      console.error(
        '[cwgo] resolveCompetitionOutcome: expected phase "pov_comp" for POV prize, got',
        phase,
      );
      return;
    }

    // applyMinigameWinner uses the current game phase (hoh_comp → applyHohWinner,
    // pov_comp → applyPovWinner) to apply the appropriate winner effect.
    dispatch(applyMinigameWinner(champ));
  };
