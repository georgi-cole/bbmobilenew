import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer, { addTvEvent, consumeBroadcastEvent, setPhase } from '../src/store/gameSlice'
import { isVisibleInMainLog, isVisibleOnTv } from '../src/services/activityService'
import WeatherController from '../src/weather/WeatherController'

vi.mock('../src/weather/weatherRuntime', () => ({
  loadWeatherRuntime: vi.fn(() => Promise.resolve()),
  getWeatherRuntime: vi.fn(() => ({ config: { temperature: { unit: 'celsius' } } })),
}))

vi.mock('../src/weather/weatherEngine', () => ({
  resolveWeatherDay: vi.fn(() => ({
    condition: 'sunny',
    temperatureC: 20,
    phenomenon: null,
  })),
}))

vi.mock('../src/features/twists/depressionShockLifecycle', () => ({
  getDepressionShockLifecycleForGame: vi.fn(() => 'inactive'),
}))

vi.mock('../src/weather/depressionShockWeather', () => ({
  getDepressionShockWeatherCondition: vi.fn(() => null),
}))

vi.mock('../src/weather/weatherTemperatureUnit', () => ({
  formatSystemWeatherTemperature: vi.fn(() => '20°C'),
}))

function makeStore() {
  return configureStore({ reducer: { game: gameReducer } })
}

function clearManagedQueue(store: ReturnType<typeof makeStore>) {
  for (const id of store.getState().game.broadcastQueue ?? []) {
    store.dispatch(consumeBroadcastEvent(id))
  }
}

describe('Faux TV Phase 0 characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps critical managed broadcasts ahead of ordinary foreground messages', () => {
    const store = makeStore()
    clearManagedQueue(store)
    const { phase, week } = store.getState().game

    store.dispatch(
      addTvEvent({
        text: 'Ordinary foreground beat',
        type: 'game',
        meta: {
          phase,
          week,
          forceOnTv: true,
          broadcastManaged: true,
          broadcastLevel: 'minor',
          broadcastOrder: 10,
        },
      })
    )
    store.dispatch(
      addTvEvent({
        text: 'Critical twist beat',
        type: 'twist',
        meta: {
          phase,
          week,
          forceOnTv: true,
          broadcastManaged: true,
          broadcastLevel: 'critical',
          broadcastPriority: 'critical',
          broadcastOrder: 999,
          major: 'custom_critical',
        },
      })
    )

    const state = store.getState().game
    const critical = state.tvFeed.find((event) => event.text === 'Critical twist beat')
    const ordinary = state.tvFeed.find((event) => event.text === 'Ordinary foreground beat')
    expect(critical).toBeTruthy()
    expect(ordinary).toBeTruthy()
    expect(state.broadcastQueue?.slice(0, 2)).toEqual([critical!.id, ordinary!.id])
  })

  it('retains the final consumed minor only for its current phase', () => {
    const store = makeStore()
    clearManagedQueue(store)
    const { phase, week } = store.getState().game

    store.dispatch(
      addTvEvent({
        text: 'Retained plain beat',
        type: 'game',
        meta: {
          phase,
          week,
          forceOnTv: true,
          broadcastManaged: true,
          broadcastLevel: 'minor',
        },
      })
    )
    const event = store.getState().game.tvFeed.find((item) => item.text === 'Retained plain beat')
    expect(event).toBeTruthy()

    store.dispatch(consumeBroadcastEvent(event!.id))
    expect(store.getState().game.lastPlainBroadcastEventId).toBe(event!.id)

    store.dispatch(setPhase('week_start'))
    expect(store.getState().game.lastPlainBroadcastEventId).toBeNull()
  })

  it('preserves legacy saved-event visibility when editorial metadata is absent', () => {
    const legacy = {
      text: 'Legacy saved event',
      type: 'game',
    }
    expect(isVisibleOnTv(legacy)).toBe(true)
    expect(isVisibleInMainLog(legacy)).toBe(true)
  })

  it('preserves an explicit Force-to-TV authoring instruction', () => {
    const forced = {
      text: 'Manager-forced event',
      type: 'game',
      channels: ['mainLog'] as const,
      meta: { forceOnTv: true },
    }
    expect(isVisibleOnTv(forced)).toBe(true)
  })

  it('queues exactly one weather bulletin behind an existing social_2 foreground beat', async () => {
    const store = makeStore()
    clearManagedQueue(store)
    act(() => {
      store.dispatch(setPhase('social_2'))
    })
    const { week } = store.getState().game

    act(() => {
      store.dispatch(
        addTvEvent({
          text: 'The nominees make their final pitches before the vote.',
          type: 'social',
          source: 'system',
          channels: ['tv', 'mainLog'],
          meta: {
            phase: 'social_2',
            week,
            forceOnTv: true,
            broadcastLevel: 'minor',
            broadcastOrder: 100,
          },
        })
      )
    })

    render(
      <Provider store={store}>
        <WeatherController />
      </Provider>
    )

    await waitFor(() => {
      const weather = store
        .getState()
        .game.tvFeed.filter((event) => event.meta?.weatherBulletin === true)
      expect(weather).toHaveLength(1)
    })

    const state = store.getState().game
    const pitch = state.tvFeed.find(
      (event) => event.text === 'The nominees make their final pitches before the vote.'
    )
    const weather = state.tvFeed.find((event) => event.meta?.weatherBulletin === true)
    expect(pitch).toBeTruthy()
    expect(weather).toBeTruthy()
    expect(weather?.meta?.broadcastOrder).toBe(20000)
    expect(state.broadcastQueue).toEqual([pitch!.id, weather!.id])
  })
})
