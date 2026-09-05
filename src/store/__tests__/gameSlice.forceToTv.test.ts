import { describe, expect, it } from 'vitest'
import gameReducer, { addTvEvent, consumeBroadcastEvent, setBroadcastOverride } from '../gameSlice'

describe('Force to TV broadcasts', () => {
  it('revives the current source event when Force to TV is enabled after it was logged', () => {
    let state = gameReducer(undefined, { type: '@@INIT' })
    const text = 'Welcome to The Big Eye. Season 2 begins now.'

    state = gameReducer(
      state,
      addTvEvent({
        text,
        type: 'game',
        meta: {
          phase: state.phase,
          week: state.week,
          broadcastTemplateId: 'season.onboarding-welcome',
          broadcastManaged: true,
          broadcastLevel: 'minor',
          forceOnTv: false,
        },
      })
    )
    const event = state.tvFeed.find((candidate) => candidate.text === text)
    expect(event).toBeDefined()

    state = gameReducer(state, consumeBroadcastEvent(event!.id))
    state = gameReducer(
      state,
      setBroadcastOverride({
        id: 'season.onboarding-welcome',
        changes: { forceOnTv: true },
      })
    )

    const revived = state.tvFeed.find((candidate) => candidate.id === event!.id)
    expect(revived?.meta?.broadcastConsumed).toBe(false)
    expect(revived?.meta?.forceOnTv).toBe(true)
    expect(state.broadcastQueue).toContain(event!.id)
  })
})
