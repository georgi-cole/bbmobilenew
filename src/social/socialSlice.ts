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
    engineComplete(_state, _action: PayloadAction<{ report: SocialPhaseReport }>) {
      // intentionally empty – report written atomically via setLastReport
    },
    setLastReport(state, action: PayloadAction<SocialPhaseReport>) {
      state.lastReport = action.payload;
    },
  },
});

export const { engineReady, engineComplete, setLastReport } = socialSlice.actions;
export default socialSlice.reducer;

// Selectors – typed against a minimal shape to avoid circular imports with store.ts
export const selectSocialBudgets = (state: { social: SocialState }) => state.social.energyBank;
export const selectLastSocialReport = (state: { social: SocialState }) =>
  state.social.lastReport ?? null;
