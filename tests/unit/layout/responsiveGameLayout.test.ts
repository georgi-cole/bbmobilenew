import { describe, expect, it } from 'vitest'
import {
  computeResponsiveGameLayout,
  type ResponsiveGameLayoutInput,
} from '../../../src/screens/GameScreen/useResponsiveGameLayout'

function makeInput(overrides: Partial<ResponsiveGameLayoutInput> = {}): ResponsiveGameLayoutInput {
  return {
    viewportWidth: 393,
    viewportHeight: 852,
    stageWidth: 393,
    stageHeight: 750,
    safeTop: 0,
    safeBottom: 34,
    navHeight: 94,
    dockHeight: 70,
    hasDock: true,
    playerCount: 16,
    userCompactRoster: false,
    userCompactRosterLayout: 'small',
    ...overrides,
  }
}

describe('responsive game layout budget', () => {
  it('uses a measured Android top-safe fallback when env safe-area is zero', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportHeight: 800,
      stageHeight: 700,
      safeTop: 0,
      safeBottom: 0,
      isAndroidLike: true,
    }))

    expect(budget.cssVars).toMatchObject({
      '--game-safe-top': '24px',
    })
  })

  it('keeps the device-bucket roster size before allowing roster scroll on phones', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportHeight: 852,
      stageHeight: 699,
      playerCount: 16,
    }))

    expect(budget.layoutSize).toBe('phone-large')
    expect(budget.baseRosterMode).toBe('normal')
    expect(budget.rosterMode).toBe('scroll')
    expect(budget.compactRoster).toBe(false)
    expect(budget.tvLogRows).toBeGreaterThanOrEqual(1)
  })

  it('does not change avatar tile size when transient vertical budget changes', () => {
    const dayEndBudget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 393,
      viewportHeight: 852,
      stageWidth: 393,
      stageHeight: 760,
      playerCount: 16,
    }))
    const liveVoteBudget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 393,
      viewportHeight: 852,
      stageWidth: 393,
      stageHeight: 700,
      playerCount: 16,
    }))

    expect(dayEndBudget.layoutSize).toBe(liveVoteBudget.layoutSize)
    expect(dayEndBudget.baseRosterMode).toBe(liveVoteBudget.baseRosterMode)
    expect(dayEndBudget.avatarTileSize).toBe(liveVoteBudget.avatarTileSize)
    expect(dayEndBudget.cssVars).toMatchObject({
      '--game-avatar-tile-size': `${dayEndBudget.avatarTileSize}px`,
    })
    expect(liveVoteBudget.cssVars).toMatchObject({
      '--game-avatar-tile-size': `${dayEndBudget.avatarTileSize}px`,
    })
  })

  it('spends extra vertical space on more TV log rows before leaving dead space', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 430,
      viewportHeight: 950,
      stageWidth: 430,
      stageHeight: 900,
      dockHeight: 74,
    }))

    expect(budget.rosterMode).toBe('normal')
    expect(budget.rosterHeaderMode).toBe('persistent')
    expect(budget.tvLogRows).toBeGreaterThanOrEqual(3)
  })

  it('classifies tablet landscape and widens the centered game cabinet intentionally', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 1024,
      viewportHeight: 768,
      stageWidth: 560,
      stageHeight: 650,
      safeBottom: 20,
      dockHeight: 76,
    }))

    expect(budget.layoutSize).toBe('tablet-landscape')
    expect(budget.shellMaxWidth).toBe(560)
    expect(budget.rosterHeaderMode).toBe('persistent')
  })
})
