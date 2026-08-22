import { describe, expect, it } from 'vitest'
import type { RootState } from '../../../src/store/store'
import { resolveDesiredMusic } from '../../../src/services/sound/resolveDesiredMusic'

function makeState(overrides: Partial<RootState> = {}): RootState {
  const base = {
    game: {
      gameId: 'game-1',
      phase: 'week_start',
      spectatorActive: null,
    },
    challenge: {
      pending: null,
    },
    social: {
      panelOpen: false,
      incomingInboxOpen: false,
    },
    ui: {
      musicScene: 'none',
    },
  } as unknown as RootState

  return {
    ...base,
    ...overrides,
    game: { ...base.game, ...(overrides.game ?? {}) },
    challenge: { ...base.challenge, ...(overrides.challenge ?? {}) },
    social: { ...base.social, ...(overrides.social ?? {}) },
    ui: { ...base.ui, ...(overrides.ui ?? {}) },
  }
}

describe('resolveDesiredMusic', () => {
  it('prefers a cinematic UI scene over every other source', () => {
    const state = makeState({
      ui: { musicScene: 'season_recap' },
      challenge: {
        pending: {
          phase: 'playing',
          game: { key: 'riskWheel' },
        },
      } as RootState['challenge'],
      social: { panelOpen: true, incomingInboxOpen: false },
      game: { phase: 'loh_comp' },
    })

    expect(resolveDesiredMusic(state, '#/game')).toBe('season_recap')
  })

  it('maps an active minigame to its dedicated music track', () => {
    const state = makeState({
      challenge: {
        pending: {
          phase: 'playing',
          game: { key: 'glass_bridge_brutal' },
        },
      } as RootState['challenge'],
    })

    expect(resolveDesiredMusic(state, '#/game')).toBe('glass_bridge')
  })

  it('reuses the glass bridge music track for Crystal Path: Infinity', () => {
    const state = makeState({
      challenge: {
        pending: {
          phase: 'playing',
          game: { key: 'crystal_path_shattered' },
        },
      } as RootState['challenge'],
    })

    expect(resolveDesiredMusic(state, '#/game')).toBe('glass_bridge')
  })

  it('falls back to social and phase music when no higher-priority scene exists', () => {
    const socialState = makeState({ social: { panelOpen: true, incomingInboxOpen: false } })
    const phaseState = makeState({ game: { phase: 'nominations' } })

    expect(resolveDesiredMusic(socialState, '#/game')).toBe('social')
    expect(resolveDesiredMusic(phaseState, '#/game')).toBe('nominations')
  })

  it.each([
    { panelOpen: true, incomingInboxOpen: false },
    { panelOpen: false, incomingInboxOpen: true },
  ])('does not interrupt active phase music when a social surface opens', (social) => {
    const state = makeState({
      game: { phase: 'nominations' },
      social,
    })

    expect(resolveDesiredMusic(state, '#/game')).toBe('nominations')
  })

  it.each(['social_2', 'live_vote', 'eviction_results', 'week_end'] as const)(
    'continues the Safety Ceremony track through %s',
    (phase) => {
      expect(resolveDesiredMusic(makeState({ game: { phase } }), '#/game')).toBe('veto')
    }
  )

  it('stays silent on the home route when nothing else is active', () => {
    expect(resolveDesiredMusic(makeState(), '#/')).toBe('none')
    expect(resolveDesiredMusic(makeState(), '#/leaderboard')).toBe('none')
  })

  // ── Finale phase scenes ──────────────────────────────────────────────────────

  it('tribunal_part1 scene maps to the jury_voting music track', () => {
    const state = makeState({ ui: { musicScene: 'tribunal_part1' } })
    expect(resolveDesiredMusic(state, '#/game')).toBe('jury_voting')
  })

  it('tribunal_part1 scene overrides game phase and social music', () => {
    const state = makeState({
      ui: { musicScene: 'tribunal_part1' },
      game: { phase: 'nominations' },
      social: { panelOpen: true, incomingInboxOpen: false },
    })
    expect(resolveDesiredMusic(state, '#/game')).toBe('jury_voting')
  })

  it('jury_voting scene maps to the jury_voting music track', () => {
    const state = makeState({ ui: { musicScene: 'jury_voting' } })
    expect(resolveDesiredMusic(state, '#/game')).toBe('jury_voting')
  })

  it('public_voting scene maps to the public_voting music track', () => {
    const state = makeState({ ui: { musicScene: 'public_voting' } })
    expect(resolveDesiredMusic(state, '#/game')).toBe('public_voting')
  })

  it('public_voting scene overrides a competing game-phase track', () => {
    const state = makeState({
      ui: { musicScene: 'public_voting' },
      game: { phase: 'nominations' },
    })
    expect(resolveDesiredMusic(state, '#/game')).toBe('public_voting')
  })

  it('game-over route maps to the final_modal music track', () => {
    expect(resolveDesiredMusic(makeState(), '#/game-over')).toBe('final_modal')
    expect(resolveDesiredMusic(makeState(), '#/gameover')).toBe('final_modal')
  })

  it('seasonComplete finale phase maps to the final_modal music track before navigation finishes', () => {
    const state = makeState({
      game: {
        seasonFinale: {
          phase: 'seasonComplete',
        },
      } as RootState['game'],
    })

    expect(resolveDesiredMusic(state, '#/game')).toBe('final_modal')
  })
})
