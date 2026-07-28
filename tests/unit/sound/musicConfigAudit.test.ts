import { describe, expect, it } from 'vitest'
import { getPoolByFilter } from '../../../src/minigames/registry'
import {
  DEFAULT_MUSIC_CONFIG,
  createMusicConfig,
  musicTrack,
  resolveMusicCue,
  type MusicResolverContext,
} from '../../../src/services/sound/musicConfig'
import { auditMusicConfig } from '../../../src/services/sound/musicConfigAudit'
import { getMusicFallbackChain } from '../../../src/services/sound/musicCatalog'

function makeContext(overrides: Partial<MusicResolverContext> = {}): MusicResolverContext {
  return {
    mode: 'classic',
    gamePhase: 'loh_comp',
    routeHash: '#/game',
    musicScene: 'none',
    finalePhase: null,
    spectatorActive: false,
    socialOpen: false,
    minigame: null,
    ...overrides,
  }
}

describe('music configuration foundations', () => {
  it('passes the full catalog and active-minigame audit', () => {
    const activeGames = getPoolByFilter({ retired: false }).map((game) => ({
      key: game.key,
      category: game.category,
    }))

    expect(auditMusicConfig(DEFAULT_MUSIC_CONFIG, activeGames)).toEqual([])
  })

  it('distinguishes explicit silence from category and phase inheritance', () => {
    const configuredRulesCue = resolveMusicCue(
      makeContext({
        minigame: { gameKey: 'bigSpender', category: 'arcade', stage: 'rules' },
      })
    )
    expect(configuredRulesCue.track).toBe('none')
    expect(configuredRulesCue.assignmentId).toBe('minigame.challenge-group-1.rules')

    const inheritedCue = resolveMusicCue(
      makeContext({
        minigame: { gameKey: 'chainOfGreed', category: 'logic', stage: 'playing' },
      })
    )
    expect(inheritedCue.track).toBe('competition')
    expect(inheritedCue.source).toBe('phase')
    expect(inheritedCue.inheritedAssignments).toContain('minigame-category.logic')
  })

  it('supports mode-specific overrides without changing Classic defaults', () => {
    const config = createMusicConfig({
      modePhaseOverrides: {
        survival: {
          week_start: musicTrack('social'),
        },
      },
    })

    expect(
      resolveMusicCue(makeContext({ mode: 'survival', gamePhase: 'week_start' }), config).track
    ).toBe('social')
    expect(
      resolveMusicCue(makeContext({ mode: 'classic', gamePhase: 'week_start' }), config).track
    ).toBe('none')
  })

  it('keeps shipped configuration JSON-serializable for future server storage', () => {
    const serialized = JSON.stringify(DEFAULT_MUSIC_CONFIG)
    const restored = JSON.parse(serialized) as typeof DEFAULT_MUSIC_CONFIG

    expect(restored.version).toBe(1)
    expect(auditMusicConfig(restored)).toEqual([])
  })

  it('publishes finite, acyclic asset fallback chains', () => {
    expect(getMusicFallbackChain('challenge_group_1')).toEqual(['competition', 'none'])
    expect(getMusicFallbackChain('season_recap')).toEqual(['jury_voting', 'none'])
  })
})
