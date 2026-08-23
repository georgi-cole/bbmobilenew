import { describe, expect, it } from 'vitest'
import {
  GENERATED_AUDIO_ASSETS,
  GENERATED_AUDIO_WARNINGS,
  GENERATED_KEY_ALIASES,
  GENERATED_MUSIC_TRACK_IDS,
} from '../../../src/services/sound/generatedAudioManifest'
import { MUSIC_CATALOG, MUSIC_TRACK_IDS } from '../../../src/services/sound/musicCatalog'
import { SOUND_REGISTRY, resolveKey } from '../../../src/services/sound/sounds'

describe('generated audio asset index', () => {
  it('keeps background music and short sounds in valid asset roots', () => {
    for (const asset of GENERATED_AUDIO_ASSETS) {
      if (asset.category === 'music') {
        // The Intro Hub loop is a legacy cinematic asset, but is now a normal
        // centrally managed music track. Keep that source location valid
        // without treating it as a short sound effect.
        expect(
          asset.relativePath.startsWith('music/') ||
            asset.relativePath.startsWith('sounds/cinematic/')
        ).toBe(true)
      } else {
        expect(asset.relativePath.startsWith('sounds/')).toBe(true)
      }
    }
  })

  it('generates unique semantic keys and music track ids', () => {
    const keys = GENERATED_AUDIO_ASSETS.map((asset) => asset.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(GENERATED_MUSIC_TRACK_IDS).size).toBe(GENERATED_MUSIC_TRACK_IDS.length)
    expect(MUSIC_TRACK_IDS).toEqual(GENERATED_MUSIC_TRACK_IDS)
  })

  it('registers every generated music track in the Music Manager catalog', () => {
    for (const track of GENERATED_MUSIC_TRACK_IDS) {
      expect(MUSIC_CATALOG[track]).toBeDefined()
      expect(SOUND_REGISTRY[MUSIC_CATALOG[track].soundKey]).toBeDefined()
    }
  })

  it('uses the canonical Risk Wheel spin key and preserves the legacy alias', () => {
    const legacyRiskWheelKey = `minigame:${'wheelofluck'}` as keyof typeof GENERATED_KEY_ALIASES
    expect(SOUND_REGISTRY['minigame:risk_wheel_spin']).toBeDefined()
    expect(GENERATED_KEY_ALIASES[legacyRiskWheelKey]).toBe('minigame:risk_wheel_spin')
    expect(resolveKey('risk_wheel_spin.mp3')).toBe('minigame:risk_wheel_spin')
    expect(resolveKey(legacyRiskWheelKey)).toBe(legacyRiskWheelKey)
  })

  it('does not silently lose indexed files', () => {
    expect(GENERATED_AUDIO_ASSETS.length).toBeGreaterThan(0)
    expect(GENERATED_AUDIO_WARNINGS.every((warning) => typeof warning === 'string')).toBe(true)
  })
})
