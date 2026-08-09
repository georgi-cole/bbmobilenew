import { describe, expect, it } from 'vitest'
import {
  SEASONS,
  buildSeasonSchedule,
  rerollSeason,
  simulateSeasonsAiField,
} from '../../../src/experiments/quickTapSeasons/quickTapSeasons'
import { getGame } from '../../../src/minigames/registryBase'

describe('Quick Tap Race 2: Seasons', () => {
  it('changes to a different season every eight seconds', () => {
    const schedule = buildSeasonSchedule(42)
    expect(schedule.map((change) => change.at)).toEqual([0, 8, 16, 24, 32])
    for (let index = 1; index < schedule.length; index += 1)
      expect(schedule[index].season).not.toBe(schedule[index - 1].season)
  })
  it('uses the requested multipliers', () => {
    expect([
      SEASONS.winter.multiplier,
      SEASONS.summer.multiplier,
      SEASONS.autumn.multiplier,
      SEASONS.spring.multiplier,
    ]).toEqual([-1, 0.5, 1, 1.25])
  })
  it('mystery boxes always select another season', () => {
    for (let seed = 1; seed <= 100; seed += 1)
      expect(rerollSeason(seed, 0, 'winter')).not.toBe('winter')
  })
  it('creates a deterministic three-AI field', () => {
    expect(simulateSeasonsAiField(7)).toEqual(simulateSeasonsAiField(7))
    expect(simulateSeasonsAiField(7)).toHaveLength(3)
  })
  it('keeps hidden timing and reroll mechanics out of player-facing rules', () => {
    const rules = getGame('quickTapSeasons')?.instructions.join(' ').toLowerCase() ?? ''
    expect(rules).not.toContain('8 seconds')
    expect(rules).not.toContain('reroll')
    expect(rules).not.toContain('only')
  })
})
