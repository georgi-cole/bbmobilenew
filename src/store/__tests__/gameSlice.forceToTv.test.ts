import { describe, expect, it } from 'vitest'
import gameReducer, { addTvEvent, consumeBroadcastEvent, setBroadcastOverride } from '../gameSlice'

describe('Force to TV broadcasts', () => {
  it('keeps the season welcome plain when its explicit onboarding source is outside the catalog', () => {
    let state = gameReducer(undefined, { type: '@@INIT' })
    const text = `Welcome to The Big Eye. Season ${state.season} begins now.`

    state = gameReducer(
      state,
      addTvEvent({
        text,
        type: 'game',
        meta: {
          phase: 'season_start',
          week: 1,
          broadcastTemplateId: 'season.onboarding-welcome',
          broadcastLevel: 'minor',
          forceOnTv: true,
          seasonOnboardingWelcome: true,
        },
      })
    )

    const welcome = state.tvFeed.find((event) => event.text === text)
    expect(welcome?.meta?.broadcastTemplateId).toBe('season.onboarding-welcome')
    expect(welcome?.meta?.phase).toBe('season_start')
    expect(welcome?.meta?.broadcastLevel).toBe('minor')
    expect(welcome?.major).toBeUndefined()
    expect(welcome?.meta?.major).toBeUndefined()
  })

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
