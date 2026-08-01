import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import glassBridgeReducer, {
  fastForwardRemainingPlayers,
} from '../../src/features/glassBridge/glassBridgeSlice'
import type { GlassBridgeState } from '../../src/features/glassBridge/glassBridgeSlice'
import {
  PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH,
  getPressurePlankSafeZoneHalfWidth,
  getPressurePlankStabilityDamagePerSecond,
} from '../../src/components/PressurePlank/pressurePlankLogic'
import { getGame } from '../../src/minigames/registry'
import { getClassicCampaignPoolForContext } from '../../src/ai/competition/bracketTemplate'

function sourceText(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('minigame logic revamps', () => {
  it('shrinks Pressure Plank to a 4% total safe zone without regeneration', () => {
    expect(getPressurePlankSafeZoneHalfWidth(10_000)).toBe(PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH)
    expect(PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH * 2).toBe(4)
    expect(getPressurePlankStabilityDamagePerSecond(1, 2, 92)).toBe(0)
    expect(getPressurePlankStabilityDamagePerSecond(70, 2, 92)).toBeGreaterThan(
      getPressurePlankStabilityDamagePerSecond(10, 2, 92)
    )

    const source = sourceText('src/components/PressurePlank/PressurePlank.tsx')
    expect(source).not.toContain('stabilityRef.current = Math.min')
    expect(source).toContain('stabilityRef.current - damagePerSecond * dt')
  })

  it('fast-forwards Crystal Path through revealed rows before ranking', () => {
    const state: GlassBridgeState = {
      phase: 'playing',
      seed: 42,
      competitionType: 'LOH',
      participants: [
        { id: 'human', name: 'You', isHuman: true },
        { id: 'ai-1', name: 'AI 1', isHuman: false },
        { id: 'ai-2', name: 'AI 2', isHuman: false },
      ],
      rowsCount: 6,
      rows: [
        { safeSide: 'left', leftBroken: false, rightBroken: true, revealedSafeSide: 'left' },
        { safeSide: 'right', leftBroken: true, rightBroken: false, revealedSafeSide: 'right' },
        { safeSide: 'left', leftBroken: false, rightBroken: true, revealedSafeSide: 'left' },
        { safeSide: 'right', leftBroken: true, rightBroken: false, revealedSafeSide: 'right' },
        { safeSide: 'left', leftBroken: false, rightBroken: true, revealedSafeSide: null },
        { safeSide: 'right', leftBroken: false, rightBroken: false, revealedSafeSide: null },
      ],
      globalTimeLimitMs: 160_000,
      challengeStartTimeMs: 0,
      chosenNumbers: { human: 1, 'ai-1': 2, 'ai-2': 3 },
      turnOrder: ['human', 'ai-1', 'ai-2'],
      currentTurnIndex: 1,
      currentPlayerRow: 1,
      progress: {
        human: {
          playerId: 'human',
          furthestRowReached: 4,
          timeReachedFurthestRowMs: 4000,
          eliminated: true,
          hintPenaltyMs: 0,
        },
        'ai-1': {
          playerId: 'ai-1',
          furthestRowReached: 0,
          timeReachedFurthestRowMs: 0,
          eliminated: false,
          hintPenaltyMs: 0,
        },
        'ai-2': {
          playerId: 'ai-2',
          furthestRowReached: 0,
          timeReachedFurthestRowMs: 0,
          eliminated: false,
          hintPenaltyMs: 0,
        },
      },
      eliminationOrder: ['human'],
      winnerId: null,
      placements: [],
      outcomeResolved: false,
      timerExpired: false,
      humanPlayerId: 'human',
      humanSpectating: false,
      parallelPlayerIds: [],
    }

    const result = glassBridgeReducer(state, fastForwardRemainingPlayers())
    expect(result.phase).toBe('complete')
    expect(result.progress['ai-1'].furthestRowReached).toBeGreaterThan(4)
    expect(result.winnerId).not.toBe('human')
  })

  it('makes hinted Capitalization choices terminal and auto-advancing', () => {
    const source = sourceText('src/components/Capitalization/Capitalization.tsx')
    expect(source).toContain('submitHintOption(option)')
    expect(source).toContain('incorrect: true')
    expect(source).toMatch(/setTimeout\(continueFromScoreboard,\s*1200\)/)
    expect(source).toContain('capitalization__winner-line')
  })

  it('keeps Grid of Luck shields but removes delayed immunity from Execution', () => {
    const source = sourceText('src/components/GridOfLuck/GridOfLuck.tsx')
    const executionStart = source.indexOf("case 'execution':")
    const executionEnd = source.indexOf("case 'swapBoxes':", executionStart)
    expect(executionStart).toBeGreaterThanOrEqual(0)
    expect(executionEnd).toBeGreaterThan(executionStart)
    const executionBlock = source.slice(executionStart, executionEnd)

    expect(executionBlock).toContain("message = `${target.name}'s shield blocks execution.`")
    expect(executionBlock).not.toContain('unopenedAfterReveal > 2')
    expect(executionBlock).toContain('target.isEliminated = true')
  })

  it('restricts Trap Auction to rosters of at least 8 and removes it from endgame', () => {
    expect(getGame('trapAuction')?.minPlayers).toBe(8)
    expect(getClassicCampaignPoolForContext({ day: 7, playerCount: 8, compType: 'LOH' })).toContain(
      'trapAuction'
    )
    expect(
      getClassicCampaignPoolForContext({ day: 8, playerCount: 7, compType: 'LOH' })
    ).not.toContain('trapAuction')
    expect(
      getClassicCampaignPoolForContext({ day: 12, playerCount: 4, compType: 'LOH' })
    ).not.toContain('trapAuction')
    expect(
      getClassicCampaignPoolForContext({
        day: 14,
        playerCount: 3,
        compType: 'LOH',
        phase: 'final3_comp3',
      })
    ).not.toContain('trapAuction')
  })

  it('forwards repeated Play presses to the Back 2 the Game local sequence', () => {
    const source = sourceText('src/components/FloatingActionBar/FloatingActionBar.tsx')
    expect(source).toMatch(
      /if \(advancedProgressRef\.current === advanceProgressKey\) \{[\s\S]*?dispatchPlayPressedEvent\(\)[\s\S]*?return/
    )
  })
})
