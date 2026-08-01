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
  it('only references active registry games', () => {
    const unknown = allKeys(DEFAULT_BRACKET_TEMPLATE).filter((key) => !getGame(key))
    const retired = allKeys(DEFAULT_BRACKET_TEMPLATE).filter((key) => getGame(key)?.retired)
    expect(unknown).toEqual([])
    expect(retired).toEqual([])
  })

  it('only schedules explicitly QA-approved campaign games', () => {
    const scheduled = new Set(allKeys(DEFAULT_BRACKET_TEMPLATE))
    const approved = new Set<string>(CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)
    expect([...scheduled].filter((key) => !approved.has(key))).toEqual([])
    expect([...approved].filter((key) => !scheduled.has(key))).toEqual([])
  })

  it('excludes unavailable, special-purpose, and low-field spectacle games from normal campaign pools', () => {
    const scheduled = new Set(allKeys(DEFAULT_BRACKET_TEMPLATE))
    expect(scheduled).not.toContain('rescueTheKing')
    expect(scheduled).not.toContain('targetPractice')
    expect(scheduled).not.toContain('blackjackTournament')
    expect(scheduled).not.toContain('riskWheel')
    expect(getGame('targetPractice')?.retired).toBe(true)
  })

  it('keeps Vault Cracker, Verdict Board, and Fit Me In POS-only and Battery Low LOH-only', () => {
    const allLoh = DEFAULT_BRACKET_TEMPLATE.flatMap((band) => band.loh)
    const allPos = DEFAULT_BRACKET_TEMPLATE.flatMap((band) => band.pos)
    expect(allLoh).not.toContain('logicLocks')
    expect(allLoh).not.toContain('hangman')
    expect(allLoh).not.toContain('tetris')
    expect(allPos).not.toContain('batteryLow')
    expect(allPos).toContain('logicLocks')
    expect(allPos).toContain('hangman')
    expect(allPos).toContain('tetris')
    expect(allLoh).toContain('batteryLow')
  })

  it('delays Silent Saboteur until housemates have had time to get acquainted', () => {
    const tooEarly = getClassicCampaignPoolForContext({
      day: 2,
      playerCount: 10,
      compType: 'LOH',
      phase: 'loh_comp',
    })
    const laterHouse = getClassicCampaignPoolForContext({
      day: 4,
      playerCount: 9,
      compType: 'LOH',
      phase: 'loh_comp',
    })
    expect(tooEarly).not.toContain('silentSaboteur')
    expect(laterHouse).toContain('silentSaboteur')
  })

  it('keeps the regular-season guide ordered by day', () => {
    const dayBands = DEFAULT_BRACKET_TEMPLATE.filter((band) => band.minDay !== undefined)
    const minDays = dayBands.map((band) => band.minDay!)
    expect(minDays).toEqual([...minDays].sort((left, right) => left - right))
  })

  it('has LOH games in every band and no Final 3 POS games', () => {
    expect(DEFAULT_BRACKET_TEMPLATE.every((band) => band.loh.length > 0)).toBe(true)
    const final3Bands = DEFAULT_BRACKET_TEMPLATE.filter(
      (band) => band.minPlayers === 3 && band.maxPlayers === 3
    )
    expect(final3Bands.length).toBeGreaterThan(0)
    expect(final3Bands.every((band) => band.pos.length === 0)).toBe(true)
  })

  it('keeps field-size-dependent spectacles out of low-roster and Final 3 pools', () => {
    const lowRosterBands = DEFAULT_BRACKET_TEMPLATE.filter((band) => band.maxPlayers <= 7)
    const lowRosterGames = new Set(lowRosterBands.flatMap((band) => [...band.loh, ...band.pos]))

    ;[
      'silentSaboteur',
      'glass_bridge_brutal',
      'crystal_path_shattered',
      'wildcardWestern',
      'riskWheel',
      'blackjackTournament',
    ].forEach((key) => expect(lowRosterGames).not.toContain(key))
  })

  it('only maps each game to player counts the registry marks as supported', () => {
    DEFAULT_BRACKET_TEMPLATE.forEach((band) => {
      for (let players = band.minPlayers; players <= band.maxPlayers; players += 1) {
        ;[...band.loh, ...band.pos].forEach((key) => {
          const game = getGame(key)
          expect(game, `${key} is missing from the registry`).toBeDefined()
          expect(
            supportsPlayerCount(game!, players),
            `${key} does not support ${players} players`
          ).toBe(true)
        })
      }
    })
  })

  it('fills the Final 3 with sustained endurance, precision, and multi-round score games', () => {
    const final3Games = new Set(
      DEFAULT_BRACKET_TEMPLATE.filter(
        (band) => band.minPlayers === 3 && band.maxPlayers === 3
      ).flatMap((band) => band.loh)
    )

    expect([...final3Games]).toEqual(
      expect.arrayContaining([
        'holdWall',
        'pressurePlank',
        'memoryMatch',
        'timingBar',
        'threeDigitsQuiz',
        'capitalization',
        'batteryLow',
      ])
    )
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
    [3, 'LOH', 'capitalization'],
  ] as const)('maps %i players / %s to %s', (playerCount, compType, expectedKey) => {
    expect(getBracketPoolForContext(playerCount, compType)).toContain(expectedKey)
  })

  it('returns no POS pool at Final 3 or pool below Final 3', () => {
    expect(getBracketPoolForContext(3, 'POS')).toEqual([])
    expect(getBracketPoolForContext(2, 'POS')).toEqual([])
    expect(getBracketPoolForContext(1, 'LOH')).toEqual([])
  })

  it('uses the widest safe band for oversized casts', () => {
    expect(getBracketPoolForContext(99, 'LOH')).toContain('holdWall')
  })

  it('returns fresh arrays and supports custom templates', () => {
    const first = getBracketPoolForContext(16, 'LOH')
    const second = getBracketPoolForContext(16, 'LOH')
    first.push('EXTRA')
    expect(second).not.toContain('EXTRA')

    const custom: BracketTemplate = [
      { label: 'test', minPlayers: 1, maxPlayers: 99, loh: ['quickTap'], pos: ['laneRacers'] },
    ]
    expect(getBracketPoolForContext(10, 'LOH', custom)).toEqual(['quickTap'])
    expect(getBracketPoolForContext(10, 'POS', custom)).toEqual(['laneRacers'])
  })
})

describe('getClassicCampaignPoolForContext', () => {
  it('uses the fixed premiere pool on day 1', () => {
    expect(
      getClassicCampaignPoolForContext({
        day: 1,
        playerCount: 10,
        compType: 'LOH',
        phase: 'loh_comp',
      })
    ).toEqual(['majorityRules'])
  })

  it('moves from the fixed premiere game to Day 2’s curated pool', () => {
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
    expect(day2.length).toBeGreaterThan(day1.length)
    expect(day2).toContain('holdWall')
  })

  it('moves to the roster-specific pool after the opening hook', () => {
    const pool = getClassicCampaignPoolForContext({
      day: 3,
      playerCount: 14,
      compType: 'LOH',
      phase: 'loh_comp',
    })
    expect(pool).toContain('memoryMatch')
    expect(pool).not.toContain('targetPractice')
  })

  it('keeps Grid of Luck out of the day guide because its 2-4 limit conflicts with a +/- 1 row', () => {
    const lateDay = getClassicCampaignPoolForContext({
      day: 13,
      playerCount: 4,
      compType: 'POS',
      phase: 'pos_comp',
    })
    expect(lateDay).not.toContain('gridOfLuck')
  })

  it('uses a disjoint, escalating pool for each Final 3 part', () => {
    const resolve = (
      phase: 'final3_comp1_minigame' | 'final3_comp2_minigame' | 'final3_comp3_minigame'
    ) => getClassicCampaignPoolForContext({ day: 14, playerCount: 3, compType: 'LOH', phase })
    const part1 = resolve('final3_comp1_minigame')
    const part2 = resolve('final3_comp2_minigame')
    const part3 = resolve('final3_comp3_minigame')

    expect(part1).toContain('holdWall')
    expect(part2).toContain('memoryMatch')
    expect(part3).toContain('capitalization')
    expect(new Set([...part1, ...part2, ...part3]).size).toBe(
      part1.length + part2.length + part3.length
    )
  })
})
