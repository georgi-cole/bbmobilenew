import { createSlice } from '@reduxjs/toolkit'

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
  | 'public_voting'

export type MusicMix = 'normal' | 'ducked'
export type ConfessionalMusicMode = 'normal' | 'vote-committed'

interface UIState {
  socialSummaryOpen: boolean
  musicScene: MusicScene
  musicMix: MusicMix
  confessionalMusicMode: ConfessionalMusicMode
  debugExpansionUnlocks: {
    cupidArrow: boolean
    voxPopuli: boolean
  }
}

const initialState: UIState = {
  socialSummaryOpen: false,
  musicScene: 'none',
  musicMix: 'normal',
  confessionalMusicMode: 'normal',
  // Intentionally Redux-only: debug access disappears with the app session and
  // is never written into the permanent VIP entitlement cache.
  debugExpansionUnlocks: {
    cupidArrow: false,
    voxPopuli: false,
  },
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openSocialSummary(state) {
      state.socialSummaryOpen = true
    },
    closeSocialSummary(state) {
      state.socialSummaryOpen = false
    },
    setMusicScene(state, action: { payload: MusicScene }) {
      state.musicScene = action.payload
    },
    setMusicMix(state, action: { payload: MusicMix }) {
      state.musicMix = action.payload
    },
    setConfessionalMusicMode(state, action: { payload: ConfessionalMusicMode }) {
      state.confessionalMusicMode = action.payload
    },
    setDebugExpansionUnlock(
      state,
      action: { payload: { expansion: 'cupidArrow' | 'voxPopuli'; unlocked: boolean } }
    ) {
      state.debugExpansionUnlocks[action.payload.expansion] = action.payload.unlocked
    },
    clearDebugExpansionUnlocks(state) {
      state.debugExpansionUnlocks.cupidArrow = false
      state.debugExpansionUnlocks.voxPopuli = false
    },
  },
})

export const {
  openSocialSummary,
  closeSocialSummary,
  setMusicScene,
  setMusicMix,
  setConfessionalMusicMode,
  setDebugExpansionUnlock,
  clearDebugExpansionUnlocks,
} = uiSlice.actions
export default uiSlice.reducer

export const selectSocialSummaryOpen = (state: { ui: UIState }) =>
  state.ui?.socialSummaryOpen ?? false
export const selectMusicScene = (state: { ui: UIState }) => state.ui?.musicScene ?? 'none'
export const selectMusicMix = (state: { ui: UIState }) => state.ui?.musicMix ?? 'normal'
export const selectConfessionalMusicMode = (state: { ui: UIState }) =>
  state.ui?.confessionalMusicMode ?? 'normal'
const EMPTY_DEBUG_EXPANSION_UNLOCKS = { cupidArrow: false, voxPopuli: false } as const
export const selectDebugExpansionUnlocks = (state: { ui: UIState }) =>
  state.ui?.debugExpansionUnlocks ?? EMPTY_DEBUG_EXPANSION_UNLOCKS
