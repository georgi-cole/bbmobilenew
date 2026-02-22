import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { SocialPhaseReport, SocialState } from './types';
import { SOCIAL_INITIAL_STATE } from './constants';

const socialSlice = createSlice({
  name: 'social',
  initialState: SOCIAL_INITIAL_STATE,
  reducers: {
    engineReady(state, action: PayloadAction<{ budgets: Record<string, number> }>) {
      state.energyBank = action.payload.budgets;
    },
    /** Signals the engine has finished a phase; report is written via setLastReport. */
    engineComplete() {},
    setLastReport(state, action: PayloadAction<SocialPhaseReport>) {
      state.lastReport = action.payload;
    },
    /** Stores the latest influence weights computed for an actor's decision. */
    influenceUpdated(
      state,
      action: PayloadAction<{
        actorId: string;
        decisionType: string;
        weights: Record<string, number>;
      }>,
    ) {
      const { actorId, weights } = action.payload;
      state.influenceWeights[actorId] = weights;
    },
  },
});

export const { engineReady, engineComplete, setLastReport, influenceUpdated } = socialSlice.actions;
export default socialSlice.reducer;

// Selectors – typed against a minimal shape to avoid circular imports with store.ts
export const selectSocialBudgets = (state: { social: SocialState }) => state.social.energyBank;
export const selectLastSocialReport = (state: { social: SocialState }) =>
  state.social.lastReport ?? null;
export const selectInfluenceWeights = (state: { social: SocialState }) =>
  state.social.influenceWeights;
