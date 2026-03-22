/**
 * nativeSfxMap.ts
 *
 * Maps app-level sound keys (used with SoundManager.play()) to the IDs and
 * file paths expected by cordova-plugin-nativeaudio.
 *
 * Only a conservative set of critical SFX that benefit most from low-latency
 * native playback are listed here.  All other SFX fall back to the existing
 * HTMLAudio pool in SoundManager.
 *
 * Paths are relative to the Cordova app's www/ root (the Cordova WebView
 * serves assets from www/).  Preload will silently fail/warn if a file is
 * missing, so mismatched paths are non-fatal.
 */

/** Maps app sound keys → native preload IDs. */
export const NATIVE_SFX_MAP = {
  'ui:click': 'ui_click',
  'ui:jury_vote': 'ui_jury_vote',
  'tv:public_favorite': 'tv_public_favorite',
  'minigame:results': 'minigame_results',
} as const;

/** Maps native preload IDs → asset file paths (relative to www/). */
export const NATIVE_SFX_PATH: Record<NativeSfxKey, string> = {
  ui_click: 'assets/sounds/ui_click.mp3',
  ui_jury_vote: 'assets/sounds/ui_jury_vote.mp3',
  tv_public_favorite: 'assets/sounds/tv_public_favorite.mp3',
  minigame_results: 'assets/sounds/minigame_results.mp3',
} as const;

/** Union of valid native preload ID strings. */
export type NativeSfxKey = (typeof NATIVE_SFX_MAP)[keyof typeof NATIVE_SFX_MAP];
