import { SoundManager } from './SoundManager'

export const GAMEPLAY_AUDIO_EXIT_EVENT = 'audio:gameplay-exit'

/**
 * Gameplay takes music ownership before its route changes because the launch
 * preloader remains mounted on the Intro Hub URL.
 */
export function beginGameplayAudioExit(): void {
  // Stop synchronously inside the user action. React state and hash navigation
  // settle later, so relying on either alone leaves a window where the queued
  // Intro Hub request can keep playing over a resumed game.
  SoundManager.stopAllMusic()
  window.dispatchEvent(new Event(GAMEPLAY_AUDIO_EXIT_EVENT))
}
