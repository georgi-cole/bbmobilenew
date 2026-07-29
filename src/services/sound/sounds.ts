/**
 * Generated-file-backed sound registry.
 *
 * Add background tracks to public/assets/music and short cues to
 * public/assets/sounds, then run npm run generate:audio (also run by dev/build).
 */
import {
  GENERATED_AUDIO_ASSETS,
  GENERATED_FILENAME_ALIASES,
  GENERATED_KEY_ALIASES,
} from './generatedAudioManifest'

export type SoundCategory = 'ui' | 'tv' | 'player' | 'minigame' | 'music'

export interface SoundEntry {
  key: string
  category: SoundCategory
  src: string
  preload: boolean
  volume?: number
  loop?: boolean
}

const _viteBase: string = import.meta.env.BASE_URL ?? '/'
export const ASSETS_BASE = `${_viteBase}assets/`
export const MUSIC_BASE = `${ASSETS_BASE}music/`
export const SOUNDS_BASE = `${ASSETS_BASE}sounds/`

const registry: Record<string, SoundEntry> = {}
for (const asset of GENERATED_AUDIO_ASSETS) {
  registry[asset.key] = {
    key: asset.key,
    category: asset.category as SoundCategory,
    src: `${ASSETS_BASE}${asset.relativePath}`,
    preload: asset.preload,
    volume: asset.volume,
    loop: asset.loop,
  }
}
for (const [alias, target] of Object.entries(GENERATED_KEY_ALIASES)) {
  const targetEntry = registry[target]
  if (targetEntry) registry[alias] = { ...targetEntry, key: alias }
}

export const SOUND_REGISTRY: Readonly<Record<string, SoundEntry>> = Object.freeze(registry)
export const FILENAME_ALIAS_MAP: Readonly<Record<string, string>> = Object.freeze({
  ...GENERATED_FILENAME_ALIASES,
  ...Object.fromEntries(
    GENERATED_AUDIO_ASSETS.map((asset) => [
      asset.relativePath
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? asset.key,
      asset.key,
    ])
  ),
})

export function resolveKey(input: string): string | null {
  if (Object.prototype.hasOwnProperty.call(SOUND_REGISTRY, input)) return input
  const stem = input.replace(/\.(mp3|wav|ogg|m4a|aac|flac)$/i, '')
  if (Object.prototype.hasOwnProperty.call(FILENAME_ALIAS_MAP, stem)) {
    return FILENAME_ALIAS_MAP[stem]
  }
  const normalized = stem
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  for (const prefix of ['ui', 'tv', 'player', 'minigame', 'music'] as const) {
    if (!normalized.startsWith(`${prefix}_`)) continue
    const candidate = `${prefix}:${normalized.slice(prefix.length + 1)}`
    if (Object.prototype.hasOwnProperty.call(SOUND_REGISTRY, candidate)) return candidate
  }
  const smartMinigame = `minigame:${normalized}`
  return Object.prototype.hasOwnProperty.call(SOUND_REGISTRY, smartMinigame) ? smartMinigame : null
}
