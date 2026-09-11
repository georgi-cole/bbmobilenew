import { describe, expect, it } from 'vitest'
import {
  resolveDesiredMusicCue,
  type MusicResolverState,
} from '../../../src/services/sound/resolveDesiredMusic'

function makeState(
  game: Partial<MusicResolverState['game']> = {},
  ui: Partial<MusicResolverState['ui']> = {}
): MusicResolverState {
  return {
    game: {
      gameId: 'room-effect-regression',
      phase: 'nominations',
      status: 'active',
      spectatorActive: null,
      ...game,
    },
    challenge: { pending: null },
    social: { panelOpen: false, incomingInboxOpen: false },
    ui: {
      musicScene: 'none',
      confessionalMusicMode: 'normal',
      ...ui,
    },
  }
}

describe('room-effect presentation policy', () => {
  it.each(['nominations', 'pos_ceremony', 'pos_ceremony_results', 'social_2'] as const)(
    'keeps normal game phase %s clear even when old vote results remain',
    (phase) => {
      const cue = resolveDesiredMusicCue(
        makeState({ phase, voteResults: { nova: 3, rae: 1 } }),
        '#/game'
      )

      expect(cue.playbackCue?.effectPreset).toBe('none')
    }
  )

  it.each([
    '#/settings',
    '#/profile',
    '#/rules',
    '#/vox-populi-rules',
    '#/leaderboard',
    '#/store',
  ])('keeps the room effect for active-game utility destination %s', (hash) => {
    const cue = resolveDesiredMusicCue(makeState(), hash)
    expect(cue.playbackCue?.effectPreset).toBe('muffled')
  })

  it('uses the room effect during the live vote tally', () => {
    const cue = resolveDesiredMusicCue(
      makeState({ phase: 'live_vote', voteResults: { nova: 3, rae: 1 } }),
      '#/game'
    )

    expect(cue.playbackCue?.effectPreset).toBe('muffled')
  })

  it('uses the room effect during the actual elimination overlay', () => {
    const cue = resolveDesiredMusicCue(
      makeState({ phase: 'eviction_results', evictionOverlayPlayerId: 'nova' }),
      '#/game'
    )

    expect(cue.playbackCue?.effectPreset).toBe('muffled')
  })

  it('does not apply utility-route room audio when no game is active', () => {
    const cue = resolveDesiredMusicCue(makeState({ status: 'completed' }), '#/settings')
    expect(cue.playbackCue?.effectPreset).not.toBe('muffled')
  })
})
