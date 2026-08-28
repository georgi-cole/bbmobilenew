import { describe, expect, it } from 'vitest'
import {
  getMinigameMusicConfig,
  getMinigameMusicConfigByTrack,
} from '../../../src/services/sound/minigameMusicConfig'
import {
  resolveDesiredMusic,
  type MusicResolverState,
} from '../../../src/services/sound/resolveDesiredMusic'

const GROUP_GAME_KEYS = ['bigSpender', 'snake', 'castleRescue', 'batteryLow', 'holdWall'] as const

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
  it.each(GROUP_GAME_KEYS)(
    'routes %s to the Intro Hub music while playing in challenge group 1',
    (gameKey) => {
      expect(resolveDesiredMusic(makeState(gameKey), '#/game')).toBe('introhub')
    }
  )

  it.each(['rules', 'countdown', 'done'])(
    'suppresses generic competition music during configured challenge phase %s',
    (phase) => {
      expect(resolveDesiredMusic(makeState('bigSpender', phase), '#/game')).toBe('none')
    }
  )

  it('reuses the Intro Hub asset with the challenge-group lifecycle timings', () => {
    const config = getMinigameMusicConfig('bigSpender')
    expect(config?.track).toBe('introhub')
    expect(config?.sound.src).toContain('assets/sounds/cinematic/Intro_hub_loop.mp3')
    expect(config?.sound.loop).toBe(true)
    expect(config?.fadeInMs).toBe(500)
    expect(config?.postGameHoldMs).toBe(2800)
    expect(config?.fadeOutMs).toBe(2000)
    expect(getMinigameMusicConfigByTrack('introhub')).toBe(config)
  })

  it('leaves unrelated minigames on their existing audio routes', () => {
    expect(getMinigameMusicConfig('riskWheel')).toBeUndefined()
    expect(resolveDesiredMusic(makeState('riskWheel'), '#/game')).toBe('risk_wheel')
  })
})
