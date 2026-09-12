import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer, { addTvEvent, consumeBroadcastEvent, setPhase } from '../src/store/gameSlice'
import { isVisibleInMainLog, isVisibleOnTv } from '../src/services/activityService'
import { getBroadcastEditorialMetadata } from '../src/broadcasting/broadcastEditorialPolicy'
import WeatherController from '../src/weather/WeatherController'
import { resolveWeatherDay } from '../src/weather/weatherEngine'

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

function addFinalPitches(store: ReturnType<typeof makeStore>, week: number) {
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

  it('retains a consumed minor id while its event remains scoped to the original phase', () => {
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
    const nextState = store.getState().game
    expect(nextState.lastPlainBroadcastEventId).toBe(event!.id)
    expect(event!.meta?.phase).toBe('season_start')
    expect(event!.meta?.phase).not.toBe(nextState.phase)
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
    expect(
      isVisibleOnTv({
        text: 'Manager-forced event',
        type: 'game',
        channels: ['mainLog'],
        meta: { forceOnTv: true },
      })
    ).toBe(true)
  })

  it('waits for the foreground social beat, then emits ordinary weather as ambient nonblocking copy', async () => {
    const store = makeStore()
    clearManagedQueue(store)
    act(() => {
      store.dispatch(setPhase('social_2'))
    })
    const { week } = store.getState().game

    act(() => addFinalPitches(store, week))

    render(
      <Provider store={store}>
        <WeatherController />
      </Provider>
    )

    expect(
      store.getState().game.tvFeed.filter((event) => event.meta?.weatherBulletin)
    ).toHaveLength(0)

    const pitch = store
      .getState()
      .game.tvFeed.find(
        (event) => event.text === 'The nominees make their final pitches before the vote.'
      )
    expect(pitch).toBeTruthy()

    act(() => {
      store.dispatch(consumeBroadcastEvent(pitch!.id))
    })

    await waitFor(() => {
      expect(
        store.getState().game.tvFeed.filter((event) => event.meta?.weatherBulletin === true)
      ).toHaveLength(1)
    })

    const state = store.getState().game
    const weather = state.tvFeed.find((event) => event.meta?.weatherBulletin === true)
    expect(weather).toBeTruthy()
    expect(weather?.meta?.forceOnTv).not.toBe(true)
    expect(getBroadcastEditorialMetadata(weather!)?.presentationMode).toBe('ambient')
    expect(state.broadcastQueue).not.toContain(weather!.id)
  })

  it('keeps noteworthy storm weather eligible for the existing foreground handoff', async () => {
    vi.mocked(resolveWeatherDay).mockReturnValueOnce({
      condition: 'stormy',
      temperatureC: 20,
      phenomenon: null,
    })
    const store = makeStore()
    clearManagedQueue(store)
    act(() => {
      store.dispatch(setPhase('social_2'))
    })
    const { week } = store.getState().game
    act(() => addFinalPitches(store, week))

    render(
      <Provider store={store}>
        <WeatherController />
      </Provider>
    )

    await waitFor(() => {
      expect(
        store.getState().game.tvFeed.filter((event) => event.meta?.weatherBulletin === true)
      ).toHaveLength(1)
    })

    const state = store.getState().game
    const pitch = state.tvFeed.find(
      (event) => event.text === 'The nominees make their final pitches before the vote.'
    )
    const weather = state.tvFeed.find((event) => event.meta?.weatherBulletin === true)
    expect(pitch).toBeTruthy()
    expect(weather?.meta?.forceOnTv).toBe(true)
    expect(getBroadcastEditorialMetadata(weather!)?.presentationMode).toBe('foreground')
    expect(state.broadcastQueue).toEqual([pitch!.id, weather!.id])
  })
})
