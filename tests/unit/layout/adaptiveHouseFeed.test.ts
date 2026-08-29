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
    stageHeight: 699,
    safeTop: 0,
    safeBottom: 34,
    navHeight: 94,
    dockHeight: 70,
    hasDock: true,
    playerCount: 16,
    userCompactRoster: false,
    inlineLogVisible: false,
    ...overrides,
  }
}

function readCssPx(budget: ReturnType<typeof computeResponsiveGameLayout>, name: string): number {
  return Number.parseFloat((budget.cssVars as Record<string, string>)[name])
}

describe('adaptive House Feed allocation', () => {
  it('uses Log-only mode when a full feed row would crowd a four-row roster', () => {
    const budget = computeResponsiveGameLayout(makeInput())

    expect(budget.tvLogRows).toBe(0)
    expect(budget.cssVars).toMatchObject({ '--game-tv-log-rows': '0' })
    expect(budget.rosterMode).toBe('normal')
  })

  it('keeps the automatic feed collapsed on a medium-height phone', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        stageHeight: 780,
      })
    )

    expect(budget.tvLogRows).toBe(0)
    expect(budget.cssVars).toMatchObject({ '--game-tv-log-rows': '0' })
  })

  it('caps the inline feed at three rows on a tall phone', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 430,
        viewportHeight: 950,
        stageWidth: 430,
        stageHeight: 900,
        dockHeight: 74,
      })
    )

    expect(budget.tvLogRows).toBe(3)
    expect(budget.cssVars).toMatchObject({ '--game-tv-log-rows': '3' })
  })

  it('keeps at least one row when the House Feed setting explicitly requests it', () => {
    const budget = computeResponsiveGameLayout(
      makeInput({
        viewportWidth: 320,
        viewportHeight: 667,
        stageWidth: 320,
        stageHeight: 560,
        dockHeight: 62,
        inlineLogVisible: true,
      })
    )

    expect(budget.tvLogRows).toBeGreaterThanOrEqual(1)
  })

  it('expands the TV viewport with sub-row surplus instead of leaving a dead gap', () => {
    const budget = computeResponsiveGameLayout(makeInput())

    expect(budget.tvLogRows).toBe(0)
    expect(readCssPx(budget, '--game-screen-tv-viewport-min-height')).toBe(144)
  })
})
