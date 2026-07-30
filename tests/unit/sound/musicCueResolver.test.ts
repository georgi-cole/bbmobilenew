import { describe, expect, it } from 'vitest'
import {
  createMusicConfig,
  musicTrack,
  resolveMusicCue,
} from '../../../src/services/sound/musicConfig'
import { createDefaultMusicCue } from '../../../src/services/sound/musicCue'

const baseContext = {
  mode: 'classic' as const,
  gamePhase: 'loh_comp',
  routeHash: '#/game',
  musicScene: 'none' as const,
  spectatorActive: false,
  socialOpen: false,
}

describe('music cue resolver variants', () => {
  it('resolves a final-round cue ahead of the normal playing assignment', () => {
    const finalCue = {
      ...createDefaultMusicCue('risk_wheel'),
      id: 'risk-wheel-final',
      displayName: 'Risk Wheel Final',
      startAtSec: 42,
      crossfadeMs: 800,
      effectPreset: 'final_round' as const,
    }
    const config = createMusicConfig({
      musicCues: { [finalCue.id]: finalCue },
      minigameAssignments: {
        classic: { riskWheel: { playing: musicTrack('risk_wheel') } },
      },
      minigameVariantAssignments: {
        classic: {
          riskWheel: {
            playing: { final_round: musicTrack('risk_wheel', finalCue.id) },
          },
        },
      },
    })

    const resolved = resolveMusicCue(
      {
        ...baseContext,
        minigame: {
          gameKey: 'riskWheel',
          category: 'arcade',
          stage: 'playing',
          variant: 'final_round',
        },
      },
      config
    )

    expect(resolved.assignmentId).toContain(
      'minigame-variant.classic.riskWheel.playing.final_round'
    )
    expect(resolved.playbackCue?.id).toBe(finalCue.id)
    expect(resolved.playbackCue?.startAtSec).toBe(42)
  })
})
