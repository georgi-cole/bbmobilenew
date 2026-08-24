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
    unifiedActionRail: true,
    playerCount: 16,
    userCompactRoster: false,
    inlineLogVisible: true,
    ...overrides,
  }
}

function readCssPx(budget: ReturnType<typeof computeResponsiveGameLayout>, name: string) {
  const value = (budget.cssVars as Record<string, string>)[name]
  return Number.parseFloat(value)
}

describe('responsive game layout budget', () => {
  it('uses the measured Android top inset without a device-wide fallback', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportHeight: 800,
        stageHeight: 700,
        safeTop: 24,
        safeBottom: 0,
        isAndroidLike: true,
      })
    )

    expect(budget.cssVars).toMatchObject({
      '--game-safe-top': '24px',
    })
  })

  it('scrolls a constrained full roster instead of forcing its last row under the dock', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportHeight: 852,
        stageHeight: 699,
        playerCount: 16,
      })
    )

    expect(budget.layoutSize).toBe('phone-large')
    expect(budget.bottomControlsMode).toBe('compact')
    expect(budget.baseRosterMode).toBe('compact-small')
    expect(budget.rosterMode).toBe('scroll')
    expect(budget.rosterHeaderMode).toBe('tv-chip')
    expect(budget.compactRoster).toBe(true)
    expect(budget.cssVars).toMatchObject({
      '--game-bottom-controls-mode': 'compact',
      '--game-action-dock-scale': '1',
      '--game-nav-height': '0px',
      '--game-nav-item-label-display': 'none',
      '--game-roster-board-height': '367px',
    })
    expect(readCssPx(budget, '--game-screen-tv-viewport-min-height')).toBeGreaterThanOrEqual(144)
    expect(budget.tvLogRows).toBeGreaterThanOrEqual(1)
  })

  it('does not reserve inline feed rows when refined chrome hides House Feed', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportHeight: 852,
        stageHeight: 699,
        playerCount: 16,
        inlineLogVisible: false,
      })
    )

    expect(budget.tvLogRows).toBe(0)
    expect(budget.cssVars).toMatchObject({ '--game-tv-log-rows': '0' })
    expect(budget.rosterMode).toBe('normal')
  })

  it('keeps the selected automatic density tier stable across viewport measurements', () => {
    const normalMeasuredBudget = computeResponsiveGameLayout(
      makeInput({
        viewportHeight: 852,
        stageHeight: 699,
        navHeight: 94,
        dockHeight: 70,
        playerCount: 16,
      })
    )
    const compactMeasuredBudget = computeResponsiveGameLayout(
      makeInput({
        viewportHeight: 852,
        stageHeight: 713,
        navHeight: 80,
        dockHeight: 63,
        playerCount: 16,
      })
    )

    expect(normalMeasuredBudget.bottomControlsMode).toBe('compact')
    expect(compactMeasuredBudget.bottomControlsMode).toBe('compact')
    expect(compactMeasuredBudget.baseRosterMode).toBe(normalMeasuredBudget.baseRosterMode)
    expect(compactMeasuredBudget.rosterMode).toBe(normalMeasuredBudget.rosterMode)
    expect(compactMeasuredBudget.avatarTileSize).toBe(normalMeasuredBudget.avatarTileSize)
  })

  it('does not change avatar tile size when transient vertical budget changes', () => {
    const dayEndBudget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 393,
        viewportHeight: 852,
        stageWidth: 393,
        stageHeight: 760,
        playerCount: 16,
      })
    )
    const liveVoteBudget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 393,
        viewportHeight: 852,
        stageWidth: 393,
        stageHeight: 700,
        playerCount: 16,
      })
    )

    expect(dayEndBudget.layoutSize).toBe(liveVoteBudget.layoutSize)
    expect(dayEndBudget.avatarTileSize).toBe(liveVoteBudget.avatarTileSize)
    expect(dayEndBudget.cssVars).toMatchObject({
      '--game-avatar-tile-size': `${dayEndBudget.avatarTileSize}px`,
    })
    expect(liveVoteBudget.cssVars).toMatchObject({
      '--game-avatar-tile-size': `${dayEndBudget.avatarTileSize}px`,
    })
    expect(dayEndBudget.rosterMode).toBe('normal')
    expect(liveVoteBudget.rosterMode).toBe('scroll')
    expect(liveVoteBudget.bottomControlsMode).toBe('compact')
  })

  it('keeps normal premium controls on iPhone Pro Max-like screens when full roster fits', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 430,
        viewportHeight: 950,
        stageWidth: 430,
        stageHeight: 900,
        dockHeight: 74,
      })
    )

    expect(budget.bottomControlsMode).toBe('normal')
    expect(budget.rosterMode).toBe('normal')
    expect(budget.rosterHeaderMode).toBe('persistent')
    expect(budget.tvLogRows).toBeGreaterThanOrEqual(3)
    expect(budget.cssVars).toMatchObject({
      '--game-nav-height': '0px',
      '--game-nav-item-label-display': 'block',
    })
  })

  it('uses the measured Android service row and compact chrome for a static full roster', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 393,
        viewportHeight: 851,
        stageWidth: 393,
        stageHeight: 700,
        safeTop: 24,
        safeBottom: 0,
        dockHeight: 70,
        isAndroidLike: true,
      })
    )

    expect(budget.cssVars).toMatchObject({
      '--game-safe-top': '24px',
    })
    expect(budget.bottomControlsMode).toBe('compact')
    expect(budget.rosterMode).toBe('scroll')
    expect(budget.compactRoster).toBe(true)
    expect(readCssPx(budget, '--game-screen-tv-viewport-min-height')).toBeGreaterThanOrEqual(144)
    const dockGap = readCssPx(budget, '--game-action-dock-gap')
    const dockHeight = readCssPx(budget, '--game-action-dock-height')
    const dockClearance = readCssPx(budget, '--game-screen-floating-dock-clearance')
    expect(dockClearance).toBeCloseTo(dockHeight * (170 / 220) + dockGap * 2, 0)
  })

  it('uses scrolling only after compact chrome and roster density are exhausted', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 320,
        viewportHeight: 667,
        stageWidth: 320,
        stageHeight: 560,
        dockHeight: 62,
      })
    )

    expect(budget.layoutSize).toBe('phone-small')
    expect(budget.bottomControlsMode).toBe('compact')
    expect(budget.rosterMode).toBe('scroll')
    expect(budget.compactRoster).toBe(true)
    expect(budget.rosterHeaderMode).toBe('tv-chip')
  })

  it('keeps tablet landscape viewports in the centered phone layout', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 1024,
        viewportHeight: 768,
        stageWidth: 976,
        stageHeight: 650,
        safeBottom: 20,
        dockHeight: 76,
      })
    )

    expect(budget.layoutSize).toBe('phone-medium')
    expect(budget.shellMaxWidth).toBe(480)
    expect(budget.rosterMode).toBe('scroll')
    expect(budget.cssVars).toMatchObject({
      '--game-cabinet-max-width': '480px',
      '--game-shell-max-width': '480px',
    })
  })

  it('keeps tablet portrait viewports in the centered phone layout', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 820,
        viewportHeight: 1180,
        stageWidth: 620,
        stageHeight: 1060,
        safeBottom: 20,
        dockHeight: 80,
      })
    )

    expect(budget.layoutSize).toBe('phone-large')
    expect(budget.shellMaxWidth).toBe(480)
    expect(budget.cssVars).toMatchObject({
      '--game-cabinet-max-width': '480px',
      '--game-shell-max-width': '480px',
    })
  })

  it('exposes a full Survivor standout mode for medium Android-sized eight-player layouts', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
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
      })
    )

    expect(budget.survivorStandoutMode).toBe('full-card')
    expect(budget.tvLogRows).toBe(3)
    expect(budget.cssVars).toMatchObject({
      '--game-tv-log-rows': '3',
      '--game-survivor-standout-min-height': '74px',
    })
  })

  it('collapses the Survivor standout on small phones instead of dropping it', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 340,
        viewportHeight: 660,
        stageWidth: 340,
        stageHeight: 660,
        navHeight: 60,
        dockHeight: 76,
        playerCount: 8,
      })
    )

    expect(budget.survivorStandoutMode).toBe('mini-chip')
  })

  it('uses available vertical room for the richer Survivor standout treatment', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 820,
        viewportHeight: 1080,
        stageWidth: 620,
        stageHeight: 980,
        dockHeight: 0,
        hasDock: false,
        playerCount: 8,
      })
    )

    expect(budget.survivorStandoutMode).toBe('full-card')
  })

  it('keeps Survivor avatar tile size stable across transient dock budget changes', () => {
    const calm = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 393,
        viewportHeight: 851,
        stageWidth: 393,
        stageHeight: 851,
        dockHeight: 76,
        playerCount: 8,
      })
    )
    const crowded = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 393,
        viewportHeight: 851,
        stageWidth: 393,
        stageHeight: 851,
        dockHeight: 140,
        playerCount: 8,
      })
    )

    expect(crowded.avatarTileSize).toBe(calm.avatarTileSize)
    expect(crowded.rosterGap).toBe(calm.rosterGap)
  })

  it('uses residual unified-rail space to deepen roster rows instead of leaving a dead band', () => {
    const constrained = computeResponsiveGameLayout(
      makeInput({
        viewportHeight: 852,
        stageHeight: 700,
        inlineLogVisible: false,
      })
    )
    const roomy = computeResponsiveGameLayout(
      makeInput({
        viewportHeight: 1002,
        stageHeight: 900,
        inlineLogVisible: false,
      })
    )

    const constrainedHeight = readCssPx(constrained, '--game-avatar-tile-height')
    const roomyHeight = readCssPx(roomy, '--game-avatar-tile-height')
    const roomyBoardHeight = readCssPx(roomy, '--game-roster-board-height')

    expect(roomy.avatarTileSize).toBe(constrained.avatarTileSize)
    expect(roomyHeight).toBeGreaterThan(constrainedHeight)
    expect(roomyHeight).toBeGreaterThan(roomy.avatarTileSize)
    expect(roomyBoardHeight).toBe(roomyHeight * 4 + roomy.rosterGap * 3)
  })
})
