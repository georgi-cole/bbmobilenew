import { describe, expect, it } from 'vitest'
import type { TvEvent } from '../../types'
import { selectCurrentQueuedBroadcast } from '../seasonOnboardingQueue'

function event(id: string, phase: string, week: number): TvEvent {
  return {
    id,
    text: id,
    type: 'game',
    source: 'system',
    timestamp: 0,
    meta: { phase, week },
  }
}

describe('season onboarding broadcast selection', () => {
  it('skips stale queue entries and finds the current season-start handoff', () => {
    const stale = event('old-week', 'week_start', 2)
    const flavor = event('opening-flavor', 'season_start', 1)

    expect(
      selectCurrentQueuedBroadcast(
        ['old-week', 'opening-flavor'],
        [stale, flavor],
        'season_start',
        1
      )
    ).toBe(flavor)
  })
})
