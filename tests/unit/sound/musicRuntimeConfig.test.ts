import { describe, expect, it } from 'vitest'
import type { RootState } from '../../../src/store/store'
import type { MusicConfigOverrides } from '../../../src/services/sound/musicConfig'
import {
  buildEffectiveMusicConfig,
  mergeMusicTrackAssets,
  selectEffectiveMusicConfig,
  selectEffectiveMusicTrackAssets,
} from '../../../src/services/sound/musicRuntimeConfig'

describe('music runtime configuration', () => {
  it('gives local Advanced Settings assignments precedence over remote assignments', () => {
    const remote: MusicConfigOverrides = {
      phaseMusic: { nominations: { kind: 'track', track: 'veto' } },
    }
    const local: MusicConfigOverrides = {
      phaseMusic: { nominations: { kind: 'track', track: 'competition' } },
    }

    expect(buildEffectiveMusicConfig(remote, local).phaseMusic.nominations).toEqual({
      kind: 'track',
      track: 'competition',
    })
  })

  it('merges track assets with local overrides above semantic and legacy remote assets', () => {
    expect(
      mergeMusicTrackAssets(
        {
          mainTrackUrl: 'https://example.com/legacy.mp3',
          tracks: [{ track: 'competition', src: 'https://example.com/remote.mp3' }],
        },
        [{ track: 'competition', src: 'https://example.com/local.mp3', loop: false }]
      )
    ).toEqual([{ track: 'competition', src: 'https://example.com/local.mp3', loop: false }])
  })

  it('falls back to bundled defaults when a partial store has no settings slice', () => {
    const partialState = {} as RootState

    expect(selectEffectiveMusicConfig(partialState).version).toBe(1)
    expect(selectEffectiveMusicTrackAssets(partialState)).toEqual([])
  })
})
