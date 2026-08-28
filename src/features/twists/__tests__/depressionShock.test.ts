import { describe, expect, it } from 'vitest'
import {
  createInitialDepressionShockState,
  evaluateDepressionShockAtDayStart,
  getDepressionShockVisualPhase,
  invertStrategicRelationshipRow,
  isDepressionShockActiveOnDay,
} from '../depressionShock'

function context(overrides: Partial<{
  gameId: string
  seed: number
  week: number
  eligibleMode: boolean
  activePlayerCount: number
  conflict: boolean
}> = {}) {
  return {
    gameId: 'game-depression-test',
    seed: 12345,
    week: 5,
    eligibleMode: true,
    activePlayerCount: 8,
    conflict: false,
    ...overrides,
  }
}

describe('Depression Shock scheduling', () => {
  it('does not roll before Day 5', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const result = evaluateDepressionShockAtDayStart(initial, context({ week: 4 }), 0)

    expect(result.event).toBe('none')
    expect(result.state.status).toBe('unrolled')
    expect(result.state.rollPassed).toBeNull()
  })

  it('rolls exactly once on Day 5 and never retries a failed roll', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const failed = evaluateDepressionShockAtDayStart(initial, context(), 0.25)

    expect(failed.event).toBe('rolled_failed')
    expect(failed.state.status).toBe('failed')
    expect(failed.state.rollPassed).toBe(false)

    const daySix = evaluateDepressionShockAtDayStart(
      failed.state,
      context({ week: 6 }),
      0
    )
    expect(daySix.event).toBe('none')
    expect(daySix.state.status).toBe('failed')
  })

  it('activates when the Day-5 roll is below 25 percent', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const result = evaluateDepressionShockAtDayStart(initial, context(), 0.249999)

    expect(result.event).toBe('activated')
    expect(result.state.status).toBe('active')
    expect(result.state.activatedDay).toBe(5)
    expect(isDepressionShockActiveOnDay(result.state, 5)).toBe(true)
    expect(isDepressionShockActiveOnDay(result.state, 6)).toBe(true)
    expect(isDepressionShockActiveOnDay(result.state, 7)).toBe(false)
  })

  it('queues a passed Day-5 roll behind another shock and activates on the next free day without rerolling', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const queued = evaluateDepressionShockAtDayStart(initial, context({ conflict: true }), 0.1)

    expect(queued.event).toBe('queued')
    expect(queued.state.status).toBe('queued')
    expect(queued.state.rollPassed).toBe(true)
    expect(queued.state.queuedDay).toBe(5)

    const stillBlocked = evaluateDepressionShockAtDayStart(
      queued.state,
      context({ week: 6, conflict: true }),
      0.99
    )
    expect(stillBlocked.event).toBe('none')
    expect(stillBlocked.state.status).toBe('queued')

    const activated = evaluateDepressionShockAtDayStart(
      stillBlocked.state,
      context({ week: 7, conflict: false }),
      0.99
    )
    expect(activated.event).toBe('activated')
    expect(activated.state.activatedDay).toBe(7)
  })

  it('does not activate if fewer than six players are active on Day 5', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const result = evaluateDepressionShockAtDayStart(
      initial,
      context({ activePlayerCount: 5 }),
      0
    )

    expect(result.event).toBe('cancelled')
    expect(result.state.status).toBe('failed')
    expect(result.state.failureReason).toBe('not_enough_active_players_on_day_5')
  })

  it('does not retroactively roll when a save first sees the feature after Day 5', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const result = evaluateDepressionShockAtDayStart(initial, context({ week: 8 }), 0)

    expect(result.event).toBe('cancelled')
    expect(result.state.status).toBe('failed')
    expect(result.state.failureReason).toBe('day_5_window_missed')
  })
})

describe('Depression Shock presentation and strategic distortion', () => {
  it('uses day-one and day-two visuals only for the two active days', () => {
    const state = {
      ...createInitialDepressionShockState('game-depression-test'),
      status: 'active' as const,
      rollPassed: true,
      activatedDay: 5,
      introSeen: true,
      day2Seen: true,
    }

    expect(getDepressionShockVisualPhase(state, 5, 'social_1')).toBe('day1')
    expect(getDepressionShockVisualPhase(state, 6, 'social_2')).toBe('day2')
    expect(getDepressionShockVisualPhase(state, 6, 'week_end')).toBe('sunbreak')
    expect(getDepressionShockVisualPhase(state, 7, 'week_start')).toBe('inactive')
  })

  it('inverts only the decision-maker relationship row', () => {
    const relationships = {
      loh: {
        ally: { affinity: 70, tags: ['alliance', 'protection'] },
        rival: { affinity: -45, tags: ['rivalry'] },
      },
      other: {
        ally: { affinity: 10, tags: [] as string[] },
      },
    }

    const result = invertStrategicRelationshipRow(relationships, 'loh')

    expect(result.loh.ally.affinity).toBe(-70)
    expect(result.loh.ally.tags).toEqual([])
    expect(result.loh.rival.affinity).toBe(45)
    expect(result.other).toBe(relationships.other)
  })
})
