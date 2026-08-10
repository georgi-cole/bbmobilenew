/**
 * nativeSfxMap.ts
 *
 * Maps app-level sound keys (used with SoundManager.play()) to the IDs and
 * file paths expected by cordova-plugin-nativeaudio.
 *
 * Only a conservative set of critical SFX that benefit most from low-latency
 * native playback are listed here. All other SFX fall back to the existing
 * HTMLAudio pool in SoundManager.
 *
 * Paths are relative to the Cordova app's www/ root (the Cordova WebView
 * serves assets from www/). Preload will silently fail/warn if a file is
 * missing, so mismatched paths are non-fatal.
 */

/** Maps app sound keys → native preload IDs. */
export const NATIVE_SFX_MAP = {
  'ui:navigate': 'ui_navigate',
  'ui:jury_vote': 'ui_jury_vote',
  'tv:public_favorite': 'tv_public_favorite',
  'minigame:results': 'minigame_results',
} as const

/** Union of valid native preload ID strings. */
export type NativeSfxKey = (typeof NATIVE_SFX_MAP)[keyof typeof NATIVE_SFX_MAP]

/**
 * Per-key configuration for native SFX preloading.
 * Volume values mirror those in SOUND_REGISTRY so native playback levels match
 * the HTMLAudio fallback. Note: native volume is baked in at preload time via
 * preloadComplex—real-time category volume changes do not affect native SFX.
 */
export const NATIVE_SFX_CONFIG: Record<NativeSfxKey, { path: string; volume: number }> = {
  ui_navigate: { path: 'assets/sounds/ui/ui_navigate.mp3', volume: 0.6 },
  ui_jury_vote: { path: 'assets/sounds/ui/ui_jury_vote.mp3', volume: 0.7 },
  tv_public_favorite: { path: 'assets/sounds/tv_public_favorite.mp3', volume: 0.9 },
  minigame_results: {
    path: 'assets/sounds/minigames/minigame_risk_wheel_scoreboard.mp3',
    volume: 0.85,
  },
} as const
