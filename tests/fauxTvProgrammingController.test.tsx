import React from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import gameReducer, { addTvEvent } from '../src/store/gameSlice'
import FauxTvProgrammingController from '../src/broadcasting/FauxTvProgrammingController'
import { getBroadcastEditorialMetadata } from '../src/broadcasting/broadcastEditorialPolicy'
import {
  BIG_EYE_PROGRAMMING_CATEGORY,
  RESUME_RECAP_MIN_ABSENCE_MS,
} from '../src/broadcasting/programmingDesk'
import type { TvEvent } from '../src/types'

function makeStore(overrides: Record<string, unknown> = {}) {
  const base = gameReducer(undefined, { type: '@@INIT' })
  const leo = base.players[0]
  const players = base.players.map((player) =>
    player.id === leo.id
      ? {
          ...player,
          status: 'loh' as const,
          stats: { lohWins: 3, posWins: 0, timesNominated: 0 },
        }
      : player
  )
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: {
      game: {
        ...base,
        phase: 'loh_results' as const,
        week: 6,
        players,
        lohId: leo.id,
        tvFeed: [],
        broadcastQueue: [],
        lastPlayedAt: Date.now(),
        ...overrides,
      },
    },
  })
}

function optionalStory(category: string, storyKey: string, week = 6): TvEvent {
  return {
    id: `existing:${storyKey}`,
    text: 'Existing editorial story',
    type: 'game',
    timestamp: Date.now() - 1_000,
    channels: ['tv', 'mainLog'],
    source: 'system',
    meta: {
      phase: 'week_start',
      week,
      editorial: {
        importance: 'optional',
        presentationMode: 'ambient',
        category,
        sensitivity: 'public',
        storyKey,
        cooldownKey: storyKey,
      },
    },
  }
}

function isStrongProgrammingStory(event: TvEvent): boolean {
  const category = getBroadcastEditorialMetadata(event)?.category
  return (
    category === 'by_the_numbers' ||
    category === BIG_EYE_PROGRAMMING_CATEGORY ||
    category === 'programming_resume_recap'
  )
}

describe('Faux TV optional programming scheduling', () => {
  it('emits a rare By the Numbers milestone without entering the official queue', async () => {
    const store = makeStore()
    const { phase, week } = store.getState().game

    store.dispatch(
      addTvEvent({
        text: 'Critical official announcement',
        type: 'twist',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          phase,
          week,
          forceOnTv: true,
          broadcastManaged: true,
          broadcastPriority: 'critical',
          broadcastLevel: 'critical',
          major: 'custom_critical',
        },
      })
    )
    const official = store
      .getState()
      .game.tvFeed.find((event) => event.text === 'Critical official announcement')

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      expect(
        store
          .getState()
          .game.tvFeed.some(
            (event) => getBroadcastEditorialMetadata(event)?.storyKey === 'stats:loh:user:3'
          )
      ).toBe(true)
    })

    const statistic = store
      .getState()
      .game.tvFeed.find(
        (event) => getBroadcastEditorialMetadata(event)?.category === 'by_the_numbers'
      )
    expect(getBroadcastEditorialMetadata(statistic!)?.presentationMode).toBe('ambient')
    expect(store.getState().game.broadcastQueue).toContain(official!.id)
    expect(store.getState().game.broadcastQueue).not.toContain(statistic!.id)
  })

  it('keeps Day 1 clean', async () => {
    const store = makeStore({ week: 1 })

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      expect(
        store.getState().game.tvFeed.filter((event) => getBroadcastEditorialMetadata(event))
      ).toHaveLength(0)
    })
  })

  it('allows a quiet ordinary day to remain quiet instead of manufacturing filler', async () => {
    const base = makeStore().getState().game
    const players = base.players.map((player) => ({
      ...player,
      stats: { lohWins: 1, posWins: 0, timesNominated: 1 },
    }))
    const store = makeStore({
      phase: 'social_1' as const,
      week: 4,
      lohId: null,
      players,
    })

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      expect(store.getState().game.tvFeed.filter(isStrongProgrammingStory)).toHaveLength(0)
    })
  })

  it('lets a rare milestone become the second ambient beat after a callback', async () => {
    const callback = optionalStory(
      BIG_EYE_PROGRAMMING_CATEGORY,
      'programming:callback:previous-shock',
      6
    )
    const store = makeStore({ tvFeed: [callback] })

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      expect(store.getState().game.tvFeed.filter(isStrongProgrammingStory)).toHaveLength(2)
    })
  })

  it('uses a meaningful resume recap without forcing additional filler', async () => {
    const oldTimestamp = Date.now() - RESUME_RECAP_MIN_ABSENCE_MS - 60_000
    const store = makeStore({ lastPlayedAt: oldTimestamp, lohId: null, phase: 'social_2' as const })

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      expect(
        store
          .getState()
          .game.tvFeed.some(
            (event) => getBroadcastEditorialMetadata(event)?.category === 'programming_resume_recap'
          )
      ).toBe(true)
    })

    const optional = store.getState().game.tvFeed.filter(isStrongProgrammingStory)
    expect(optional).toHaveLength(1)
    expect(optional[0].meta?.forceOnTv).not.toBe(true)
    expect(store.getState().game.broadcastQueue).not.toContain(optional[0].id)
  })
})
