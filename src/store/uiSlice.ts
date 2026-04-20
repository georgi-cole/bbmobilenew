import { createSlice } from '@reduxjs/toolkit';

/**
 * MusicScene — identifies the music scene currently active.
 *
 * Dispatching ui/setMusicScene from a component is the mechanism for
 * special finale/cinematic phases to influence the BGM channel.
 * The resolver (resolveDesiredMusic) only treats a non-'none' value as a
 * highest-priority override when that scene maps to a real track; scenes
 * that currently map to 'none' are intentionally transparent and fall
 * through to game phase, minigame, social, or intro-hub music.
 *
 * Values:
 *  'none'            — no scene override; resolver falls through to game
 *                      phase / minigame / social / intro-hub logic
 *  'season_recap'    — FinalFaceoff recap act; maps to the dedicated
 *                      season recap music track.
 *  'tribunal_part1'  — FinalFaceoff 'clues' act: jurors send hidden-vote
 *                      messages.  Maps to the jury_voting music track.
 *  'jury_voting'     — FinalFaceoff 'revealVotes' act: vote chips revealed,
 *                      tally shown, winner crowned.  Maps to jury_voting track.
 *  'public_voting'   — SeasonFinaleOverlay public-favourite vote flow.
 *                      Maps to the dedicated public-voting track.
 */
export type MusicScene =
  | 'none'
  | 'season_recap'
  | 'tribunal_part1'
  | 'jury_voting'
  | 'public_voting';

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
