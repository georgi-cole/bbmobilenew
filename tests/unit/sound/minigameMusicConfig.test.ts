import { describe, expect, it } from 'vitest'
import {
  getMinigameMusicConfig,
  getMinigameMusicConfigByTrack,
} from '../../../src/services/sound/minigameMusicConfig'
import {
  resolveDesiredMusic,
  type MusicResolverState,
} from '../../../src/services/sound/resolveDesiredMusic'

const GROUP_GAME_KEYS = ['bigSpender', 'snake', 'castleRescue', 'batteryLow'] as const

function makeState(gameKey: string, phase = 'playing'): MusicResolverState {
  return {
    game: {
      gameId: 'test-game',
      phase: 'loh_comp',
      spectatorActive: false,
      seasonFinale: null,
    },
    challenge: {
      pending: {
        phase,
        game: { key: gameKey },
      },
    },
    social: {
      panelOpen: false,
      incomingInboxOpen: false,
    },
    ui: { musicScene: 'none' },
  }
}

describe('centralized minigame music configuration', () => {
  it.each(GROUP_GAME_KEYS)('routes %s to challenge group 1 music while playing', (gameKey) => {
    expect(resolveDesiredMusic(makeState(gameKey), '#/game')).toBe('challenge_group_1')
  })

  it('does not route the track before the playing phase', () => {
    expect(resolveDesiredMusic(makeState('bigSpender', 'countdown'), '#/game')).toBe('competition')
  })

  it('stores the requested asset and lifecycle timings in one config', () => {
    const config = getMinigameMusicConfig('bigSpender')
    expect(config?.sound.src).toContain('assets/sounds/challenge_group_1_audio.mp3')
    expect(config?.sound.loop).toBe(true)
    expect(config?.fadeInMs).toBe(500)
    expect(config?.postGameHoldMs).toBe(2800)
    expect(config?.fadeOutMs).toBe(2000)
    expect(getMinigameMusicConfigByTrack('challenge_group_1')).toBe(config)
  })

  it('leaves unrelated minigames on their existing audio routes', () => {
    expect(getMinigameMusicConfig('riskWheel')).toBeUndefined()
    expect(resolveDesiredMusic(makeState('riskWheel'), '#/game')).toBe('risk_wheel')
  })
})
