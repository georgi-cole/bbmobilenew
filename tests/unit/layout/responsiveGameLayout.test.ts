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
    ...overrides,
  }
}

function readCssPx(budget: ReturnType<typeof computeResponsiveGameLayout>, name: string) {
  const value = (budget.cssVars as Record<string, string>)[name]
  return Number.parseFloat(value)
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

  it('uses compact bottom controls before compacting an iPhone Pro-like roster', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportHeight: 852,
      stageHeight: 699,
      playerCount: 16,
    }))

    expect(budget.layoutSize).toBe('phone-large')
    expect(budget.bottomControlsMode).toBe('compact')
    expect(budget.baseRosterMode).toBe('normal')
    expect(budget.rosterMode).toBe('normal')
    expect(budget.rosterHeaderMode).toBe('tv-chip')
    expect(budget.compactRoster).toBe(false)
    expect(budget.cssVars).toMatchObject({
      '--game-bottom-controls-mode': 'compact',
      '--game-action-dock-scale': '0.9',
      '--game-nav-height': '46px',
      '--game-nav-item-label-display': 'none',
      '--game-roster-board-height': '335px',
    })
    expect(readCssPx(budget, '--game-screen-tv-viewport-min-height')).toBeGreaterThanOrEqual(144)
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
    expect(dayEndBudget.rosterMode).toBe('normal')
    expect(liveVoteBudget.rosterMode).toBe('normal')
  })

  it('keeps normal premium controls on iPhone Pro Max-like screens when full roster fits', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 430,
      viewportHeight: 950,
      stageWidth: 430,
      stageHeight: 900,
      dockHeight: 74,
    }))

    expect(budget.bottomControlsMode).toBe('normal')
    expect(budget.rosterMode).toBe('normal')
    expect(budget.rosterHeaderMode).toBe('persistent')
    expect(budget.tvLogRows).toBeGreaterThanOrEqual(3)
    expect(budget.cssVars).toMatchObject({
      '--game-nav-height': '60px',
      '--game-nav-item-label-display': 'block',
    })
  })

  it('keeps Pixel 6 Android-style screens on a static full roster with protected service row', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 393,
      viewportHeight: 851,
      stageWidth: 393,
      stageHeight: 700,
      safeTop: 0,
      safeBottom: 0,
      dockHeight: 70,
      isAndroidLike: true,
    }))

    expect(budget.cssVars).toMatchObject({
      '--game-safe-top': '24px',
    })
    expect(['normal', 'compact']).toContain(budget.bottomControlsMode)
    expect(budget.rosterMode).toBe('normal')
    expect(budget.compactRoster).toBe(false)
    expect(readCssPx(budget, '--game-screen-tv-viewport-min-height')).toBeGreaterThanOrEqual(144)
  })

  it('tries compact bottom controls before compact roster fallback on small old phones', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 320,
      viewportHeight: 667,
      stageWidth: 320,
      stageHeight: 560,
      dockHeight: 62,
    }))

    expect(budget.layoutSize).toBe('phone-small')
    expect(budget.bottomControlsMode).toBe('compact')
    expect(budget.rosterMode).toBe('compact-small')
    expect(budget.compactRoster).toBe(true)
    expect(budget.rosterHeaderMode).toBe('tv-chip')
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
    expect(budget.rosterMode).not.toBe('scroll')
  })

  it('exposes a full Survivor standout mode for medium Android-sized eight-player layouts', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 393,
      viewportHeight: 851,
      stageWidth: 393,
      stageHeight: 851,
      safeTop: 0,
      safeBottom: 0,
      navHeight: 60,
      dockHeight: 76,
      playerCount: 8,
      isAndroidLike: true,
    }))

    expect(budget.survivorStandoutMode).toBe('full-card')
    expect(budget.tvLogRows).toBe(5)
    expect(budget.cssVars).toMatchObject({
      '--game-tv-log-rows': '5',
      '--game-survivor-standout-min-height': '74px',
    })
  })

  it('collapses the Survivor standout on small phones instead of dropping it', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 340,
      viewportHeight: 660,
      stageWidth: 340,
      stageHeight: 660,
      navHeight: 60,
      dockHeight: 76,
      playerCount: 8,
    }))

    expect(budget.survivorStandoutMode).toBe('mini-chip')
  })

  it('uses the richer Survivor standout treatment on tablet budgets', () => {
    const budget = computeResponsiveGameLayout(makeInput({
      viewportWidth: 820,
      viewportHeight: 1080,
      stageWidth: 520,
      stageHeight: 980,
      dockHeight: 0,
      hasDock: false,
      playerCount: 8,
    }))

    expect(budget.survivorStandoutMode).toBe('full-card')
  })

  it('keeps Survivor avatar tile size stable across transient dock budget changes', () => {
    const calm = computeResponsiveGameLayout(makeInput({
      viewportWidth: 393,
      viewportHeight: 851,
      stageWidth: 393,
      stageHeight: 851,
      dockHeight: 76,
      playerCount: 8,
    }))
    const crowded = computeResponsiveGameLayout(makeInput({
      viewportWidth: 393,
      viewportHeight: 851,
      stageWidth: 393,
      stageHeight: 851,
      dockHeight: 140,
      playerCount: 8,
    }))

    expect(crowded.avatarTileSize).toBe(calm.avatarTileSize)
    expect(crowded.rosterGap).toBe(calm.rosterGap)
  })
})
