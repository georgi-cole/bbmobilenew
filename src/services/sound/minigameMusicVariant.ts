import type { MusicMinigameVariant } from './musicConfig'

export const MINIGAME_MUSIC_VARIANT_EVENT = 'bb:minigame-music-variant'

export interface MinigameMusicVariantDetail {
  variant: MusicMinigameVariant
  gameKey?: string
}

export function publishMinigameMusicVariant(variant: MusicMinigameVariant, gameKey?: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<MinigameMusicVariantDetail>(MINIGAME_MUSIC_VARIANT_EVENT, {
      detail: { variant, ...(gameKey ? { gameKey } : {}) },
    })
  )
}
