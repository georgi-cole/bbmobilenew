import {
  MUSIC_CATALOG,
  MUSIC_TRACK_IDS,
  getMusicFallbackChain,
  getMusicFallbackTrack,
  getMusicTrackDefinition,
  type CatalogMusicTrack,
} from './musicCatalog'

export type MusicTrack = 'none' | CatalogMusicTrack

export const MUSIC_TRACK_SOUND_KEYS: Readonly<Record<CatalogMusicTrack, string>> = Object.freeze(
  Object.fromEntries(
    MUSIC_TRACK_IDS.map((track) => [track, MUSIC_CATALOG[track].soundKey])
  ) as Record<CatalogMusicTrack, string>
)

const SOUND_KEY_TO_TRACK: Readonly<Record<string, MusicTrack>> = Object.freeze({
  // Remote configuration historically replaces the general competition track.
  'music:remote_main': 'competition',
  ...Object.fromEntries(MUSIC_TRACK_IDS.map((track) => [MUSIC_CATALOG[track].soundKey, track])),
})

export function musicTrackFromSoundKey(key: string | null | undefined): MusicTrack {
  if (!key) return 'none'
  return SOUND_KEY_TO_TRACK[key] ?? 'none'
}

export {
  MUSIC_CATALOG,
  MUSIC_TRACK_IDS,
  getMusicFallbackChain,
  getMusicFallbackTrack,
  getMusicTrackDefinition,
}
export type { CatalogMusicTrack, MusicTrackDefinition } from './musicCatalog'
