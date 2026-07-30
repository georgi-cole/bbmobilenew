import type { GameMode } from '../../modes/modeTypes'
import {
  DEFAULT_MINIGAME_MUSIC_PROFILES,
  getMinigameStageSelection,
  type MusicConfigMode,
} from './musicConfig'
import { getMusicTrackSoundEntry } from './musicCatalog'
import type { SoundEntry } from './sounds'
import type { MusicTrack } from './musicTracks'

/**
 * Backward-compatible view of managed minigame music profiles.
 * The authoritative data now lives in musicConfig.ts and musicCatalog.ts.
 */
export interface MinigameMusicConfig {
  track: Exclude<MusicTrack, 'none'>
  sound: SoundEntry
  gameKeys: readonly string[]
  modes: readonly MusicConfigMode[]
  fadeInMs: number
  /** Keep the track playing while the winner badge animation and sting complete. */
  postGameHoldMs: number
  fadeOutMs: number
}

export const MINIGAME_MUSIC_CONFIGS: readonly MinigameMusicConfig[] =
  DEFAULT_MINIGAME_MUSIC_PROFILES.flatMap((profile) => {
    const selection = getMinigameStageSelection(profile, 'playing')
    const transition = profile.transition
    if (!transition?.managedLifecycle || selection.kind !== 'track') return []

    const sound = getMusicTrackSoundEntry(selection.track)
    if (!sound) return []

    return [
      {
        track: selection.track,
        sound,
        gameKeys: profile.gameKeys,
        modes: profile.modes,
        fadeInMs: transition.fadeInMs,
        postGameHoldMs: transition.postGameHoldMs,
        fadeOutMs: transition.fadeOutMs,
      },
    ]
  })

function modeMatches(modes: readonly MusicConfigMode[], mode: GameMode): boolean {
  return modes.includes('any') || modes.includes(mode)
}

export function getMinigameMusicConfig(
  gameKey: string | null | undefined,
  mode: GameMode = 'classic'
): MinigameMusicConfig | undefined {
  if (!gameKey) return undefined
  return MINIGAME_MUSIC_CONFIGS.find(
    (config) => modeMatches(config.modes, mode) && config.gameKeys.includes(gameKey)
  )
}

export function getMinigameMusicConfigByTrack(
  track: MusicTrack,
  mode: GameMode = 'classic'
): MinigameMusicConfig | undefined {
  return MINIGAME_MUSIC_CONFIGS.find(
    (config) => modeMatches(config.modes, mode) && config.track === track
  )
}
