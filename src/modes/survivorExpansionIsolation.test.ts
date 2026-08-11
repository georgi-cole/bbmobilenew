import { beforeEach, describe, expect, it } from 'vitest'
import gameReducer, {
  activateCupidArrowNow,
  activateVoxPopuliNow,
  createInitialGameState,
  setSeasonExpansion,
} from '../store/gameSlice'
import { createSurvivorRun } from './survivorRun'
import { createEmptyStoreEntitlements, saveCachedVipEntitlement } from '../vip/vipStorage'

describe('season expansion isolation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not schedule an expansion in an ordinary unowned Classic season', () => {
    const game = createInitialGameState({ seed: 42 })

    expect(game.expansionMode).toBeNull()
    expect(game.cupidArrow?.status).toBe('inactive')
    expect(game.voxPopuli?.status).toBe('inactive')
  })

  it('does not inject an owned paid ruleset into a directly selected Classic season', () => {
    saveCachedVipEntitlement({
      isActive: false,
      entitlements: { ...createEmptyStoreEntitlements(), cupidArrow: true },
      lastVerifiedAt: new Date().toISOString(),
    })

    const game = createInitialGameState({ seed: 42 })
    expect(game.expansionMode).toBeNull()
    expect(game.cupidArrow?.status).toBe('inactive')
  })

  it('strips expansion state from Surveyeval and rejects expansion activation', () => {
    let game = createSurvivorRun()

    game = gameReducer(game, setSeasonExpansion('cupidArrow'))
    game = gameReducer(game, activateCupidArrowNow())
    game = gameReducer(game, activateVoxPopuliNow())

    expect(game.mode).toBe('survival')
    expect(game.expansionMode).toBeNull()
    expect(game.cupidArrow?.status).toBe('inactive')
    expect(game.voxPopuli?.status).toBe('inactive')
  })
})
