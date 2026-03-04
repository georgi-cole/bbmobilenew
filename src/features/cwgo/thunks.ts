/**
 * Thunk: resolveCompetitionOutcome
 *
 * Reads the completed CWGO competition state and awards the HOH or POV prize
 * by dispatching the existing `applyMinigameWinner` action from gameSlice.
 *
 * This relies on the game being in the correct phase (hoh_comp or pov_comp)
 * when the CWGO competition is resolved.
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
    // applyMinigameWinner uses the current game phase (hoh_comp → applyHohWinner,
    // pov_comp → applyPovWinner), so the game must be in the right phase.
    dispatch(applyMinigameWinner(champ));
  };
