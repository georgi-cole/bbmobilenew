import { describe, expect, it } from 'vitest'
import gameReducer, { addTvEvent, consumeBroadcastEvent } from '../gameSlice'

describe('Depression Shock broadcast recovery', () => {
  it('does not replay an existing consumed comfort-card broadcast', () => {
    const text = 'The Big Eye has left chocolates for everyone.'
    let state = gameReducer(undefined, { type: '@@INIT' })

    state = gameReducer(
      state,
      addTvEvent({
        text,
        type: 'social',
        channels: ['mainLog'],
        source: 'system',
        meta: { week: state.week },
      })
    )
    const existing = state.tvFeed.find((event) => event.text === text)
    expect(existing).toBeDefined()

    state = gameReducer(state, consumeBroadcastEvent(existing!.id))
    state = gameReducer(
      state,
      addTvEvent({
        text,
        type: 'social',
        channels: ['tv', 'mainLog'],
        source: 'system',
        meta: {
          week: state.week,
          broadcastTemplateId: 'depression-shock.chocolates',
          broadcastLevel: 'major',
          major: 'depression_shock_chocolates',
          forceOnTv: true,
          depressionShockQueued: true,
        },
      })
    )

    expect(state.broadcastQueue).not.toContain(existing!.id)
    expect(state.tvFeed.filter((event) => event.text === text)).toHaveLength(1)
    expect(state.tvFeed.find((event) => event.id === existing!.id)?.meta?.broadcastConsumed).toBe(
      true
    )
  })
})
