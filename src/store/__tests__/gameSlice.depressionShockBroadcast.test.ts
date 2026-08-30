import { describe, expect, it } from 'vitest'
import gameReducer, { addTvEvent, consumeBroadcastEvent } from '../gameSlice'

describe('Depression Shock broadcast recovery', () => {
  it('promotes an existing consumed log entry back into the Faux TV queue exactly once', () => {
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
          requeueDuplicateBroadcast: true,
          depressionShockQueued: true,
        },
      })
    )

    expect(state.broadcastQueue).toContain(existing!.id)
    expect(state.tvFeed.filter((event) => event.text === text)).toHaveLength(1)
    expect(state.tvFeed.find((event) => event.id === existing!.id)?.meta).toMatchObject({
      broadcastConsumed: false,
      depressionShockQueued: true,
      forceOnTv: true,
      major: 'depression_shock_chocolates',
    })
  })
})
