import { describe, expect, it } from 'vitest'
import { sanitiseMusicConfigOverrides } from '../../../src/services/sound/musicConfigSanitizer'

describe('music cue sanitizer', () => {
  it('preserves valid cues and final-round assignments', () => {
    const result = sanitiseMusicConfigOverrides({
      musicCues: {
        final: {
          id: 'final',
          displayName: 'Final Round',
          track: 'competition',
          startAtSec: 30,
          endAtSec: 50,
          loop: true,
          volume: 0.8,
          fadeInMs: 300,
          fadeOutMs: 500,
          crossfadeMs: 700,
          restartPolicy: 'restart',
          effectPreset: 'final_round',
        },
      },
      minigameVariantAssignments: {
        classic: {
          riskWheel: {
            playing: {
              final_round: { kind: 'track', track: 'competition', cueId: 'final' },
            },
          },
        },
      },
    })
    expect(result.musicCues?.final?.startAtSec).toBe(30)
    expect(result.minigameVariantAssignments?.classic?.riskWheel?.playing?.final_round).toEqual({
      kind: 'track',
      track: 'competition',
      cueId: 'final',
    })
  })

  it('drops cues whose end precedes their start', () => {
    const result = sanitiseMusicConfigOverrides({
      musicCues: {
        broken: {
          id: 'broken',
          displayName: 'Broken',
          track: 'competition',
          startAtSec: 30,
          endAtSec: 10,
          loop: true,
          volume: 1,
          fadeInMs: 0,
          fadeOutMs: 0,
          crossfadeMs: 0,
          restartPolicy: 'restart',
          effectPreset: 'none',
        },
      },
    })
    expect(result.musicCues).toBeUndefined()
  })
})
