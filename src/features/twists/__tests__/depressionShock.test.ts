import { describe, expect, it } from 'vitest'
import {
  buildDepressionShockAvatarCandidates,
  createInitialDepressionShockState,
  evaluateDepressionShockAtDayStart,
  getDepressionShockVisualPhase,
  getDepressionShockPresentation,
  invertStrategicRelationshipRow,
  isDepressionShockEligibleMode,
  isDepressionShockActiveOnDay,
} from '../depressionShock'

function context(
  overrides: Partial<{
    gameId: string
    seed: number
    week: number
    eligibleMode: boolean
    activePlayerCount: number
    conflict: boolean
  }> = {}
) {
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
  it('is eligible only for Classic and Vox Populi seasons', () => {
    expect(isDepressionShockEligibleMode({ mode: 'classic', expansionMode: null })).toBe(true)
    expect(isDepressionShockEligibleMode({ mode: 'classic', expansionMode: 'voxPopuli' })).toBe(
      true
    )
    expect(isDepressionShockEligibleMode({ mode: 'classic', expansionMode: 'cupidArrow' })).toBe(
      false
    )
    expect(isDepressionShockEligibleMode({ mode: 'survival', expansionMode: null })).toBe(false)
  })

  it('does not roll before Day 7', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const result = evaluateDepressionShockAtDayStart(initial, context({ week: 6 }), 0)

    expect(result.event).toBe('none')
    expect(result.state.status).toBe('unrolled')
    expect(result.state.rollPassed).toBeNull()
  })

  it('rolls once per day from Day 7 through Day 10 after a failed roll', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const failed = evaluateDepressionShockAtDayStart(initial, context({ week: 7 }), 0.25)

    expect(failed.event).toBe('rolled_failed')
    expect(failed.state.status).toBe('unrolled')
    expect(failed.state.rollPassed).toBe(false)
    expect(failed.state.lastRollDay).toBe(7)

    const sameDay = evaluateDepressionShockAtDayStart(failed.state, context({ week: 7 }), 0)
    expect(sameDay.event).toBe('none')
    expect(sameDay.state.lastRollDay).toBe(7)

    const dayEight = evaluateDepressionShockAtDayStart(failed.state, context({ week: 8 }), 0.25)
    expect(dayEight.event).toBe('rolled_failed')
    expect(dayEight.state.lastRollDay).toBe(8)
  })

  it('activates when any Day-7-to-Day-10 roll is below 25 percent', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const result = evaluateDepressionShockAtDayStart(initial, context({ week: 9 }), 0.249999)

    expect(result.event).toBe('activated')
    expect(result.state.status).toBe('active')
    expect(result.state.activatedDay).toBe(9)
    expect(isDepressionShockActiveOnDay(result.state, 9)).toBe(true)
    expect(isDepressionShockActiveOnDay(result.state, 10)).toBe(true)
    expect(isDepressionShockActiveOnDay(result.state, 11)).toBe(false)
  })

  it('queues a passed daily roll behind another shock and activates on the next free day without rerolling', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const queued = evaluateDepressionShockAtDayStart(
      initial,
      context({ week: 7, conflict: true }),
      0.1
    )

    expect(queued.event).toBe('queued')
    expect(queued.state.status).toBe('queued')
    expect(queued.state.rollPassed).toBe(true)
    expect(queued.state.queuedDay).toBe(7)

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

  it('does not activate if fewer than six players are active on a roll day', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const result = evaluateDepressionShockAtDayStart(
      initial,
      context({ week: 7, activePlayerCount: 5 }),
      0
    )

    expect(result.event).toBe('cancelled')
    expect(result.state.status).toBe('failed')
    expect(result.state.failureReason).toBe('not_enough_active_players_on_roll_day')
  })

  it('does not retroactively roll when a save first sees the feature after Day 10', () => {
    const initial = createInitialDepressionShockState('game-depression-test')
    const result = evaluateDepressionShockAtDayStart(initial, context({ week: 11 }), 0)

    expect(result.event).toBe('cancelled')
    expect(result.state.status).toBe('failed')
    expect(result.state.failureReason).toBe('roll_window_missed')
  })
})

describe('Depression Shock presentation and strategic distortion', () => {
  it('prefers a generated sad sibling for the portrait actually in use', () => {
    const candidates = buildDepressionShockAvatarCandidates('lia', [
      '/bbmobilenew/assets/skins/Lia_flip_avatar.webp',
    ])

    expect(candidates[0]).toBe('/assets/skins/Lia_flip_sad_avatar.png')
    expect(candidates).toContain('/assets/skins/lia_sad_avatar.png')
  })

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
    expect(getDepressionShockVisualPhase(state, 6, 'week_end')).toBe('day2')
    expect(getDepressionShockVisualPhase(state, 7, 'week_start')).toBe('sunbreak')
    expect(getDepressionShockPresentation(state, 7, 'week_start')).toBe('ending')

    const recovered = {
      ...state,
      status: 'completed' as const,
      endingSeen: true,
      completedDay: 7,
    }
    expect(getDepressionShockVisualPhase(recovered, 7, 'loh_comp_announcement')).toBe('inactive')
    expect(getDepressionShockVisualPhase(recovered, 8, 'week_start')).toBe('inactive')
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
