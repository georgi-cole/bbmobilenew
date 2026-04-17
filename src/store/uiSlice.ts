import { createSlice } from '@reduxjs/toolkit';

export type MusicScene = 'none' | 'season_recap' | 'jury_voting';

interface UIState {
  socialSummaryOpen: boolean;
  musicScene: MusicScene;
}

const initialState: UIState = {
  socialSummaryOpen: false,
  musicScene: 'none',
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
    setMusicScene(state, action: { payload: MusicScene }) {
      state.musicScene = action.payload;
    },
  },
});

export const { openSocialSummary, closeSocialSummary, setMusicScene } = uiSlice.actions;
export default uiSlice.reducer;

export const selectSocialSummaryOpen = (state: { ui: UIState }) =>
  state.ui?.socialSummaryOpen ?? false;
export const selectMusicScene = (state: { ui: UIState }) =>
  state.ui?.musicScene ?? 'none';
