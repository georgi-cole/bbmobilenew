import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import {
  markMajorityRulesOutcomeResolved,
  type MajorityRulesState,
} from './majorityRulesSlice';

export const resolveMajorityRulesOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const majorityRules = (state as RootState & { majorityRules?: MajorityRulesState }).majorityRules;
    if (!majorityRules || majorityRules.phase !== 'complete') return;
    if (majorityRules.outcomeResolved) return;
    if (!majorityRules.winnerId) return;

    const phase = state.game.phase;
    if (majorityRules.competitionType === 'HOH' && phase !== 'hoh_comp') return;
    if (majorityRules.competitionType === 'POV' && phase !== 'pov_comp') return;

    dispatch(markMajorityRulesOutcomeResolved());
    dispatch(
      applyMinigameWinner({
        winnerId: majorityRules.winnerId,
        lastPlaceId: majorityRules.eliminatedIds[0] ?? null,
        lastPlaceType: 'survival',
      }),
    );
  };
