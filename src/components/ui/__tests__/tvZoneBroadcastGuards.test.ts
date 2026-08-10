import { describe, expect, it } from 'vitest'
import type { Phase, TvEvent } from '../../../types'
import {
  getTvPresentationBroadcastLevel,
  isCurrentPhaseBroadcastEvent,
} from '../tvZoneBroadcastGuards'

type EventOptions = {
  major?: string
  level?: 'minor' | 'major' | 'critical'
  phase?: Phase
  week?: number
}

function makeEvent(options: EventOptions = {}): TvEvent {
  const { major, level, phase = 'social_1', week = 2 } = options
  return {
    id: 'test-event',
    text: 'Test broadcast',
    type: 'social',
    timestamp: 1,
    ...(major ? { major } : {}),
    meta: {
      phase,
      week,
      ...(major ? { major } : {}),
      ...(level ? { broadcastLevel: level } : {}),
    },
  }
}

describe('tvZoneBroadcastGuards', () => {
  it.each(['twin_shock_clue', 'twin_shock_confessional', 'twin_shock_bond'])(
    'presents ambient Twin Shock beat %s as minor even when legacy metadata says major',
    (major) => {
      const event = makeEvent({ major, level: 'major' })
      expect(getTvPresentationBroadcastLevel(event)).toBe('minor')
    }
  )

  it('preserves major presentation for unrelated broadcasts', () => {
    const event = makeEvent({ major: 'double_eviction', level: 'major' })
    expect(getTvPresentationBroadcastLevel(event)).toBe('major')
  })

  it('accepts a queued event from the current day and phase', () => {
    const event = makeEvent({ phase: 'live_vote', week: 2, level: 'minor' })
    expect(isCurrentPhaseBroadcastEvent(event, 'live_vote', 2)).toBe(true)
  })

  it('rejects a queued event from a previous day', () => {
    const remyEviction = makeEvent({ phase: 'eviction_results', week: 1, level: 'minor' })
    expect(isCurrentPhaseBroadcastEvent(remyEviction, 'live_vote', 2)).toBe(false)
  })

  it('rejects a queued event from a previous phase on the same day', () => {
    const oldPhaseEvent = makeEvent({ phase: 'social_2', week: 2, level: 'minor' })
    expect(isCurrentPhaseBroadcastEvent(oldPhaseEvent, 'live_vote', 2)).toBe(false)
  })
})
