import { SOUNDS_BASE, type SoundEntry } from './sounds'

/**
 * Stable semantic track identifiers used by the resolver and SoundManager.
 * Keep file paths and display metadata here rather than scattering them across
 * phase switches and individual minigame components.
 */
export const MUSIC_TRACK_IDS = [
  'spectator',
  'social',
  'competition',
  'nominations',
  'veto',
  'risk_wheel',
  'glass_bridge',
  'quick_tap',
  'wildcard_western',
  'challenge_group_1',
  'season_recap',
  'jury_voting',
  'public_voting',
  'final_modal',
] as const

export type CatalogMusicTrack = (typeof MUSIC_TRACK_IDS)[number]
export type MusicTrackFallback = CatalogMusicTrack | 'none'
export type MusicTrackTag =
  | 'ambient'
  | 'competition'
  | 'ceremony'
  | 'minigame'
  | 'social'
  | 'spectator'
  | 'finale'

export interface MusicTrackDefinition {
  displayName: string
  soundKey: string
  fallbackTrack: MusicTrackFallback
  tags: readonly MusicTrackTag[]
  /**
   * Optional registry entry for tracks that are not part of the legacy static
   * SOUND_REGISTRY. AudioStateSync registers these entries during app startup.
   */
  dynamicSound?: SoundEntry
}

export const MUSIC_CATALOG: Readonly<Record<CatalogMusicTrack, MusicTrackDefinition>> = {
  spectator: {
    displayName: 'Spectator',
    soundKey: 'music:spectator_loop',
    fallbackTrack: 'competition',
    tags: ['ambient', 'spectator'],
  },
  social: {
    displayName: 'Social Module',
    soundKey: 'music:social_module',
    fallbackTrack: 'none',
    tags: ['ambient', 'social'],
  },
  competition: {
    displayName: 'General Competition',
    soundKey: 'music:hoh_comp_general',
    fallbackTrack: 'none',
    tags: ['ambient', 'competition'],
  },
  nominations: {
    displayName: 'Nominations',
    soundKey: 'music:nominations_main',
    fallbackTrack: 'competition',
    tags: ['ambient', 'ceremony'],
  },
  veto: {
    displayName: 'Safety Ceremony',
    soundKey: 'music:veto_phase',
    fallbackTrack: 'competition',
    tags: ['ambient', 'ceremony'],
  },
  risk_wheel: {
    displayName: 'Risk Wheel',
    soundKey: 'music:risk_wheel_loop',
    fallbackTrack: 'competition',
    tags: ['competition', 'minigame'],
  },
  glass_bridge: {
    displayName: 'Crystal Path',
    soundKey: 'music:gb_main',
    fallbackTrack: 'competition',
    tags: ['competition', 'minigame'],
  },
  quick_tap: {
    displayName: 'Quick Tap Family',
    soundKey: 'music:quicktap_main',
    fallbackTrack: 'competition',
    tags: ['competition', 'minigame'],
  },
  wildcard_western: {
    displayName: 'Wildcard Western',
    soundKey: 'music:wildcard_western_main',
    fallbackTrack: 'competition',
    tags: ['competition', 'minigame'],
  },
  challenge_group_1: {
    displayName: 'Challenge Group 1',
    soundKey: 'music:challenge_group_1',
    fallbackTrack: 'competition',
    tags: ['competition', 'minigame'],
    dynamicSound: {
      key: 'music:challenge_group_1',
      category: 'music',
      src: `${SOUNDS_BASE}challenge_group_1_audio.mp3`,
      preload: false,
      volume: 0.4,
      loop: true,
    },
  },
  season_recap: {
    displayName: 'Season Recap',
    soundKey: 'music:season_recap',
    fallbackTrack: 'jury_voting',
    tags: ['ambient', 'finale'],
  },
  jury_voting: {
    displayName: 'Tribunal Voting',
    soundKey: 'music:jury_voting_bg',
    fallbackTrack: 'none',
    tags: ['ambient', 'finale'],
  },
  public_voting: {
    displayName: 'Public Voting',
    soundKey: 'music:public_voting',
    fallbackTrack: 'jury_voting',
    tags: ['ceremony', 'finale'],
  },
  final_modal: {
    displayName: 'Final Results',
    soundKey: 'music:final_modal',
    fallbackTrack: 'jury_voting',
    tags: ['ambient', 'finale'],
  },
}

export function getMusicTrackDefinition(track: CatalogMusicTrack): MusicTrackDefinition {
  return MUSIC_CATALOG[track]
}

export function getDynamicMusicSoundEntries(): SoundEntry[] {
  return MUSIC_TRACK_IDS.flatMap((track) => {
    const dynamicSound = MUSIC_CATALOG[track].dynamicSound
    return dynamicSound ? [dynamicSound] : []
  })
}

export function getMusicFallbackTrack(track: CatalogMusicTrack): MusicTrackFallback {
  return MUSIC_CATALOG[track].fallbackTrack
}

/**
 * Returns the configured asset-fallback chain without repeating tracks.
 * SoundManager does not consume it yet; the Music Manager and audit layer do.
 */
export function getMusicFallbackChain(track: CatalogMusicTrack): MusicTrackFallback[] {
  const chain: MusicTrackFallback[] = []
  const seen = new Set<CatalogMusicTrack>()
  let current: MusicTrackFallback = track

  while (current !== 'none' && !seen.has(current)) {
    seen.add(current)
    current = getMusicFallbackTrack(current)
    chain.push(current)
  }

  return chain
}
