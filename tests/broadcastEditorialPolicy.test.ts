import { describe, expect, it } from 'vitest'
import {
  evaluateBroadcastEditorialPolicy,
  getBroadcastPresentationMode,
} from '../src/broadcasting/broadcastEditorialPolicy'
import type { TvEvent } from '../src/types'

function event(overrides: Partial<TvEvent> = {}): TvEvent {
  return {
    id: 'event',
    text: 'Story',
    type: 'game',
    timestamp: 100,
    ...overrides,
  }
}

describe('broadcast editorial policy', () => {
  it('keeps metadata-free legacy events protected and foreground-compatible', () => {
    const legacy = event()
    expect(getBroadcastPresentationMode(legacy)).toBe('foreground')
    expect(
      evaluateBroadcastEditorialPolicy(legacy, [], { maxOptionalStories: 0 }, 200)
    ).toMatchObject({ eligible: true, protected: true, reason: 'legacy_or_required' })
  })

  it('never lets optional budgets suppress required, critical, interrupt, or forced content', () => {
    const saturatedHistory = [
      event({
        id: 'old-optional',
        meta: { editorial: { importance: 'optional', category: 'house' } },
      }),
    ]
    const config = { maxOptionalStories: 0, categoryBudgets: { house: 0 }, cooldownMs: 1000 }

    const required = event({
      id: 'required',
      meta: { editorial: { importance: 'required', category: 'house' } },
    })
    const critical = event({ id: 'critical', meta: { broadcastLevel: 'critical' } })
    const interrupt = event({
      id: 'interrupt',
      meta: { editorial: { importance: 'optional', presentationMode: 'interrupt' } },
    })
    const forced = event({
      id: 'forced',
      meta: {
        forceOnTv: true,
        editorial: { importance: 'optional', presentationMode: 'log_only' },
      },
    })

    for (const candidate of [required, critical, interrupt, forced]) {
      expect(
        evaluateBroadcastEditorialPolicy(candidate, saturatedHistory, config, 200).eligible
      ).toBe(true)
    }
  })

  it('applies budgets, expiry and cooldown only to explicitly optional stories', () => {
    const optional = event({
      meta: {
        editorial: {
          importance: 'optional',
          category: 'house',
          storyKey: 'story-a',
          expiresAt: 500,
        },
      },
    })

    expect(evaluateBroadcastEditorialPolicy(optional, [], {}, 200).eligible).toBe(true)
    expect(evaluateBroadcastEditorialPolicy(optional, [], {}, 600).reason).toBe('expired')
    expect(
      evaluateBroadcastEditorialPolicy(optional, [], { maxOptionalStories: 0 }, 200).reason
    ).toBe('optional_budget')
  })
})
