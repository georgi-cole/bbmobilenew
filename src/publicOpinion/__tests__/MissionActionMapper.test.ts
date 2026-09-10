import { describe, expect, it } from 'vitest'
import { resolveEventMissionProgress } from '../MissionActionMapper'
import type { PublicDirection } from '../types'

function direction(overrides: Partial<PublicDirection> = {}): PublicDirection {
  return {
    id: 'closer-rune',
    type: 'get_closer',
    playerId: 'test',
    relatedPlayerId: 'rune',
    description: 'Get closer to Rune',
    status: 'active',
    createdWeek: 4,
    expiresAtWeek: 6,
    approvalDelta: 5,
    progressPercent: 0,
    progressHistory: [],
    ...overrides,
  }
}

describe('public request progress', () => {
  it('treats one compliment as a first beat instead of a completed relationship', () => {
    const [signal] = resolveEventMissionProgress(
      {
        type: 'positive_social',
        actorId: 'test',
        targetId: 'rune',
        actionId: 'compliment',
        week: 4,
      },
      [direction()]
    )

    expect(signal.newProgress).toBe(34)
    expect(signal.isComplete).toBe(false)
  })

  it('dampens a repeated move and stops rewarding a third copy', () => {
    const repeated = direction({
      progressPercent: 48,
      progressHistory: [
        {
          key: 'positive_social:compliment:rune',
          eventType: 'positive_social',
          actionId: 'compliment',
          targetId: 'rune',
          delta: 34,
          week: 4,
        },
        {
          key: 'positive_social:compliment:rune',
          eventType: 'positive_social',
          actionId: 'compliment',
          targetId: 'rune',
          delta: 14,
          week: 4,
        },
      ],
    })

    expect(
      resolveEventMissionProgress(
        {
          type: 'positive_social',
          actorId: 'test',
          targetId: 'rune',
          actionId: 'compliment',
          week: 4,
        },
        [repeated]
      )
    ).toEqual([])
  })

  it('rewards a different relevant move and lets a harmful move erase momentum', () => {
    const current = direction({ progressPercent: 34 })
    const [varied] = resolveEventMissionProgress(
      {
        type: 'positive_social',
        actorId: 'test',
        targetId: 'rune',
        actionId: 'deep_talk',
        week: 4,
      },
      [current]
    )
    const [setback] = resolveEventMissionProgress(
      {
        type: 'negative_social',
        actorId: 'test',
        targetId: 'rune',
        actionId: 'insult',
        week: 4,
      },
      [direction({ progressPercent: varied.newProgress })]
    )

    expect(varied.newProgress).toBe(68)
    expect(setback.progressDelta).toBe(-24)
    expect(setback.newProgress).toBe(44)
  })

  it('keeps genuinely binary competition requests immediate', () => {
    const [signal] = resolveEventMissionProgress({ type: 'pov_win', actorId: 'test', week: 4 }, [
      direction({ id: 'win-safety', type: 'win_veto' }),
    ])

    expect(signal.newProgress).toBe(100)
    expect(signal.isComplete).toBe(true)
  })
})
