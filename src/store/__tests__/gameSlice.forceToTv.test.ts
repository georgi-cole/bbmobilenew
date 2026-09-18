import { describe, expect, it } from 'vitest'
import { createInitialTwinShockState } from '../../bb/twinShock'
import gameReducer, {
  addTvEvent,
  advance,
  consumeBroadcastEvent,
  setBroadcastOverride,
} from '../gameSlice'

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

  it('keeps an authored runtime level and lets a next-delivery prompt take the next TV slot', () => {
    let state = gameReducer(undefined, { type: '@@INIT' })

    for (const id of state.broadcastQueue ?? []) {
      state = gameReducer(state, consumeBroadcastEvent(id))
    }

    state = gameReducer(
      state,
      addTvEvent({
        text: 'Earlier queued item',
        type: 'game',
        meta: {
          forceOnTv: true,
          broadcastLevel: 'minor',
          broadcastOrder: 100,
        },
      })
    )
    const earlier = state.tvFeed.find((event) => event.text === 'Earlier queued item')
    expect(earlier).toBeDefined()

    state = gameReducer(
      state,
      addTvEvent({
        text: 'Runtime prompt that must be seen next',
        type: 'game',
        meta: {
          forceOnTv: true,
          broadcastLevel: 'major',
          broadcastOrder: 10000,
          broadcastDelivery: 'next',
          announcementTitle: 'Runtime Prompt',
        },
      })
    )

    const runtimePrompt = state.tvFeed.find(
      (event) => event.text === 'Runtime prompt that must be seen next'
    )
    expect(runtimePrompt).toBeDefined()
    expect(runtimePrompt?.meta?.broadcastLevel).toBe('major')
    expect(runtimePrompt?.major).toBe('custom_major')
    expect(state.broadcastQueue?.[0]).toBe(runtimePrompt?.id)
    expect(state.broadcastQueue).toContain(earlier?.id)
  })

  it('queues the Day 2 Twin Shock hint for a real minor Faux-TV turn', () => {
    let state = gameReducer(undefined, { type: '@@INIT' })
    state = {
      ...state,
      phase: 'loh_results',
      week: 2,
      tvFeed: [],
      broadcastQueue: [],
      twinShockConsumed: false,
      twinShock: createInitialTwinShockState(),
      players: state.players.map((player) =>
        player.id === 'lia' ? { ...player, status: 'active' as const } : player
      ),
    }

    expect(state.players.some((player) => player.id === 'lia')).toBe(true)

    state = gameReducer(state, advance())

    const clue = state.tvFeed.find(
      (event) =>
        event.text ===
        'Someone mentioned that Lia looked different in the garden, but nobody pushed it further.'
    )
    expect(clue).toBeDefined()
    expect(clue?.meta?.broadcastLevel).toBe('minor')
    expect(clue?.meta?.forceOnTv).toBe(true)
    expect(state.broadcastQueue).toContain(clue?.id)
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
