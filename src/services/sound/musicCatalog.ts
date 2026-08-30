import { SOUND_REGISTRY, type SoundEntry } from './sounds'
import { GENERATED_MUSIC_TRACK_IDS, GENERATED_MUSIC_TRACKS } from './generatedAudioManifest'

export const MUSIC_TRACK_IDS = GENERATED_MUSIC_TRACK_IDS
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
  dynamicSound?: SoundEntry
}

export interface MusicTrackAssetOverride {
  track: CatalogMusicTrack
  src: string
  volume?: number
  loop?: boolean
}

export const MUSIC_CATALOG = GENERATED_MUSIC_TRACKS as unknown as Readonly<
  Record<CatalogMusicTrack, MusicTrackDefinition>
>

export function isCatalogMusicTrack(value: unknown): value is CatalogMusicTrack {
  return typeof value === 'string' && (MUSIC_TRACK_IDS as readonly string[]).includes(value)
}

export function getMusicTrackDefinition(
  track: CatalogMusicTrack
): MusicTrackDefinition | undefined {
  return MUSIC_CATALOG[track]
}

export function getMusicTrackSoundEntry(track: CatalogMusicTrack): SoundEntry | undefined {
  const definition = getMusicTrackDefinition(track)
  return definition ? SOUND_REGISTRY[definition.soundKey] : undefined
}

export function getDynamicMusicSoundEntries(): SoundEntry[] {
  return []
}

export function createMusicTrackOverrideSound(asset: MusicTrackAssetOverride): SoundEntry {
  const fallbackEntry = getMusicTrackSoundEntry(asset.track)
  return {
    key: `music:override:${asset.track}`,
    category: 'music',
    src: asset.src,
    preload: false,
    volume: asset.volume ?? fallbackEntry?.volume ?? 0.5,
    loop: asset.loop ?? fallbackEntry?.loop ?? true,
  }
}

export function getMusicFallbackTrack(track: CatalogMusicTrack): MusicTrackFallback {
  // A generated catalog can be stale when a caller bypasses the normal npm
  // lifecycle. Missing metadata must degrade to silence instead of throwing and
  // taking down the game UI.
  return getMusicTrackDefinition(track)?.fallbackTrack ?? 'none'
}

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
