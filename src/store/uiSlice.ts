import { createSlice } from '@reduxjs/toolkit';

interface UIState {
  socialSummaryOpen: boolean;
}

const initialState: UIState = {
  socialSummaryOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openSocialSummary(state) {
      state.socialSummaryOpen = true;
    },
    closeSocialSummary(state) {
      state.socialSummaryOpen = false;
    },
  },
});

export const { openSocialSummary, closeSocialSummary } = uiSlice.actions;
export default uiSlice.reducer;

export const selectSocialSummaryOpen = (state: { ui: UIState }) =>
  state.ui?.socialSummaryOpen ?? false;
