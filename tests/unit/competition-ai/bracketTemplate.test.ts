import { describe, expect, it } from 'vitest'
import {
  CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS,
  DEFAULT_BRACKET_TEMPLATE,
  getBracketPoolForContext,
  getClassicCampaignPoolForContext,
  type BracketTemplate,
} from '../../../src/ai/competition/bracketTemplate'
import { getGame, supportsPlayerCount } from '../../../src/minigames/registry'

function allKeys(template: BracketTemplate): string[] {
  return template.flatMap((band) => [...band.loh, ...band.pos])
}

describe('classic campaign map registry integrity', () => {
  it('only references active, explicitly approved registry games', () => {
    const scheduled = new Set(allKeys(DEFAULT_BRACKET_TEMPLATE))
    const approved = new Set<string>(CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)
    expect([...scheduled].filter((key) => !getGame(key) || getGame(key)?.retired)).toEqual([])
    expect([...scheduled].filter((key) => !approved.has(key))).toEqual([])
    expect([...approved].filter((key) => !scheduled.has(key))).toEqual([])
  })

  it('keeps special-purpose games out of ordinary regular-season bands', () => {
    const regularBands = DEFAULT_BRACKET_TEMPLATE.filter((band) => band.minDay !== undefined)
    const regular = new Set(allKeys(regularBands))
    expect(regular).not.toContain('finalThreeCircuit')
    expect(regular).not.toContain('rescueTheKing')
    expect(regular).not.toContain('targetPractice')
    expect(regular).not.toContain('blackjackTournament')
    expect(regular).not.toContain('riskWheel')
  })

  it('only maps each game to field sizes its registry entry supports', () => {
    DEFAULT_BRACKET_TEMPLATE.forEach((band) => {
      for (let players = band.minPlayers; players <= band.maxPlayers; players += 1) {
        ;[...band.loh, ...band.pos].forEach((key) => {
          const game = getGame(key)
          expect(game, `${key} is missing from the registry`).toBeDefined()
          expect(supportsPlayerCount(game!, players), `${key} does not support ${players} players`).toBe(true)
        })
      }
    })
  })

  it('reserves Final Three Circuit for Final 3 Parts 1 and 2', () => {
    const part1 = DEFAULT_BRACKET_TEMPLATE.find((band) =>
      band.phases?.includes('final3_comp1_minigame')
    )
    const part2 = DEFAULT_BRACKET_TEMPLATE.find((band) =>
      band.phases?.includes('final3_comp2_minigame')
    )
    const game = getGame('finalThreeCircuit')

    expect(part1?.loh).toEqual(['finalThreeCircuit'])
    expect(part2?.loh).toEqual(['finalThreeCircuit'])
    expect(game?.minPlayers).toBe(2)
    expect(game?.maxPlayers).toBe(3)
  })
})

describe('getBracketPoolForContext compatibility resolver', () => {
  it.each([
    [16, 'LOH', 'holdWall'],
    [13, 'POS', 'quickTap'],
    [10, 'LOH', 'memoryMatch'],
    [9, 'POS', 'tetris'],
    [5, 'POS', 'quickTap'],
    [4, 'LOH', 'batteryLow'],
    [3, 'LOH', 'finalThreeCircuit'],
  ] as const)('maps %i players / %s to %s', (playerCount, compType, expectedKey) => {
    expect(getBracketPoolForContext(playerCount, compType)).toContain(expectedKey)
  })

  it('keeps Final 3 free of POS games', () => {
    expect(getBracketPoolForContext(3, 'POS')).toEqual([])
    expect(getBracketPoolForContext(2, 'POS')).toEqual([])
  })
})

describe('getClassicCampaignPoolForContext', () => {
  it('uses the fixed premiere pool on day 1 and a larger curated pool from day 2', () => {
    const day1 = getClassicCampaignPoolForContext({
      day: 1,
      playerCount: 16,
      compType: 'LOH',
      phase: 'loh_comp',
    })
    const day2 = getClassicCampaignPoolForContext({
      day: 2,
      playerCount: 16,
      compType: 'LOH',
      phase: 'loh_comp',
    })
    expect(day1).toEqual(['majorityRules'])
    expect(day2).toContain('holdWall')
    expect(day2.length).toBeGreaterThan(day1.length)
  })

  it('keeps the finale phase-owned: Parts 1 and 2 are Circuit, Part 3 stays separate', () => {
    const resolve = (
      phase: 'final3_comp1_minigame' | 'final3_comp2_minigame' | 'final3_comp3_minigame'
    ) => getClassicCampaignPoolForContext({ day: 14, playerCount: 3, compType: 'LOH', phase })

    expect(resolve('final3_comp1_minigame')).toEqual(['finalThreeCircuit'])
    expect(resolve('final3_comp2_minigame')).toEqual(['finalThreeCircuit'])
    expect(resolve('final3_comp3_minigame')).not.toContain('finalThreeCircuit')
  })

  it('is mode-agnostic for Classic, Vox Populi and Cupid finale scheduling', () => {
    // These three modes all use this same non-Survival campaign map in challengeSlice;
    // mode-specific state only affects AI identity, not the Final 3 phase lane.
    for (const phase of ['final3_comp1_minigame', 'final3_comp2_minigame'] as const) {
      expect(
        getClassicCampaignPoolForContext({ day: 14, playerCount: 3, compType: 'LOH', phase })
      ).toEqual(['finalThreeCircuit'])
    }
  })
})
